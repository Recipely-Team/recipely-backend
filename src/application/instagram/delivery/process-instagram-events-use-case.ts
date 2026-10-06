import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { DmRuleLimits } from '@domain/instagram/dm-rule-limits';
import { DmSendReason, type DmSendReasonType } from '@domain/instagram/dm-send-reason';
import { DmSendStatus } from '@domain/instagram/dm-send-status';
import type { DmRule } from '@domain/instagram/dm-rule';
import type { InstagramConnection } from '@domain/instagram/instagram-connection';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type { DmSendRepositoryInterface } from '@domain/instagram/dm-send-repository-interface';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { InstagramEventQueueInterface, QueuedInstagramEvent } from '@application/instagram/ports/instagram-event-queue-interface';
import { commentOf, type InstagramComment } from '@application/instagram/delivery/instagram-comment';
import type { PrivateReplyCard } from '@application/instagram/ports/private-reply-card';

/** The card speaks the creator's market until rules carry their own locale. */
const CARD_LOCALE = 'tr';
const CARD_BUTTON_TITLE = 'Tarifi aç';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const BATCH = 20;
/** Claims of one event before it is given up on. */
export const MAX_EVENT_ATTEMPTS = 6;
/** Retry delay doubles per attempt (1, 2, 4… minutes), capped at an hour. */
const BACKOFF_CAP_MINUTES = 60;
const HOUR_MS = 60 * MINUTE_MS;
/** Finished events are kept this long (for debugging a send), then pruned. */
const EVENT_RETENTION_DAYS = 7;

export interface ProcessInstagramEventsResult {
  readonly processed: number;
  readonly sent: number;
  readonly retried: number;
}

/**
 * What one event came to: finished (with or without a send), or to be retried
 * later — with the attempt it claimed, if any, so giving up can close it.
 */
type Handled =
  | { readonly sent: boolean }
  | { readonly retry: string; readonly sendId?: string; readonly rateLimited?: boolean };

/**
 * **The comment-to-DM worker** — one tick claims up to 20 queued comments.
 *
 * @remarks
 * - Ignored (the event is just done): a comment on an account not linked
 *   here, the creator's own comment, a post without an enabled rule, or text
 *   no rule matches. The first matching rule (oldest) wins.
 * - One attempt per comment, ever (`DmSendRepositoryInterface.claim`); a
 *   redelivered webhook finds it and stops.
 * - Recorded as failed, with a reason: a comment over 7 days old (Instagram
 *   refuses a private reply then), a recipe others cannot open, no usable
 *   connection, a recipient that cannot be messaged, any other refusal.
 * - A rate limit (or a store error) leaves the attempt pending and retries the
 *   event with doubling backoff; after {@link MAX_EVENT_ATTEMPTS} the event is
 *   failed and the attempt closed as `rate_limited` / `upstream_error`.
 * - A token Instagram refuses expires the connection, so the owner sees
 *   "reconnect" instead of silent failures; a missing permission does not
 *   (`permission_missing`).
 * - The optional public reply is sent only after the DM went out; its own
 *   failure does not fail the send.
 * - Once an hour, finished events older than 7 days are pruned.
 */
export class ProcessInstagramEventsUseCase {
  private lastPrunedAt = 0;

  constructor(
    private readonly queue: InstagramEventQueueInterface,
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly rules: DmRuleRepositoryInterface,
    private readonly sends: DmSendRepositoryInterface,
    private readonly recipes: RecipeRepositoryInterface,
    private readonly graph: InstagramGraphInterface | null,
    private readonly logger: LoggerInterface,
    private readonly recipeLinkBase: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<Result<ProcessInstagramEventsResult, Failure>> {
    const now = this.now();
    if (now.getTime() - this.lastPrunedAt >= HOUR_MS) {
      this.lastPrunedAt = now.getTime();
      await this.queue.prune(new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS));
      await this.sends.scrubCommenterDetailsBefore(
        new Date(now.getTime() - DmRuleLimits.CommenterDetailRetentionDays * DAY_MS),
      );
    }
    const claimed = await this.queue.claim(now, BATCH);
    if (!claimed.ok) return claimed;
    let sent = 0;
    let retried = 0;
    for (const event of claimed.value) {
      const handled = await this.handle(event, now);
      if ('retry' in handled) {
        retried += 1;
        await this.retryOrFail(event, handled, now);
        continue;
      }
      if (handled.sent) sent += 1;
      await this.queue.done(event.id, now);
    }
    return ok({ processed: claimed.value.length, sent, retried });
  }

  private async handle(event: QueuedInstagramEvent, now: Date): Promise<Handled> {
    const comment = commentOf(event.payload);
    if (comment === null) return { sent: false };
    const connection = await this.connections.findByIgUserId(event.igUserId);
    if (!connection.ok) return { retry: connection.failure.messageKey };
    if (connection.value === null || isOwnComment(comment, connection.value)) return { sent: false };

    const rules = await this.rules.findEnabledForMedia(connection.value.userId, comment.mediaId);
    if (!rules.ok) return { retry: rules.failure.messageKey };
    const rule = rules.value.find((candidate) => candidate.matches(comment.text));
    if (rule === undefined) return { sent: false };

    const claim = await this.sends.claim({
      ruleId: rule.id,
      userId: rule.userId,
      commentId: comment.commentId,
      commenterId: comment.fromId,
      commenterUsername: comment.fromUsername,
      commentText: comment.text,
    });
    if (!claim.ok) return { retry: claim.failure.messageKey };
    if (claim.value.status !== DmSendStatus.Pending) return { sent: false };

    const refusal = await this.refusal(event, rule, connection.value, now);
    if (typeof refusal === 'object' && refusal !== null) return { ...refusal, sendId: claim.value.id };
    if (refusal !== null) return this.finish(claim.value.id, refusal, false, now);
    return this.deliver(claim.value.id, event, rule, comment, connection.value, now);
  }

  /** Why this comment cannot be answered at all, before asking Instagram — or a retry when the store failed. */
  private async refusal(
    event: QueuedInstagramEvent,
    rule: DmRule,
    connection: InstagramConnection,
    now: Date,
  ): Promise<DmSendReasonType | { readonly retry: string } | null> {
    if (now.getTime() - event.eventTime.getTime() > DmRuleLimits.PrivateReplyWindowDays * DAY_MS) return DmSendReason.TooOld;
    if (this.graph === null || !connection.isUsable(now)) return DmSendReason.NotConnected;
    // Read as a guest: the commenter is usually not a Recipely user, so the link must open for anyone.
    const recipe = await this.recipes.getById(rule.recipeId);
    if (recipe.ok) return null;
    return recipe.failure.code === 'not_found' ? DmSendReason.RecipeUnavailable : { retry: recipe.failure.messageKey };
  }

  /** The recipe card for the reply; null (plain text) when the recipe can't be read. */
  private async cardFor(rule: DmRule, comment: InstagramComment, url: string): Promise<PrivateReplyCard | null> {
    const read = await this.recipes.getById(rule.recipeId);
    const recipe = read.ok ? read.value?.recipe : undefined;
    if (recipe === undefined) return null;
    return {
      title: recipe.localize(CARD_LOCALE).name,
      subtitle: rule.render(comment.fromUsername ?? '', '').trim(),
      imageUrl: recipe.image.length > 0 ? recipe.image : null,
      url,
      buttonTitle: CARD_BUTTON_TITLE,
    };
  }

  private async deliver(
    sendId: string,
    event: QueuedInstagramEvent,
    rule: DmRule,
    comment: InstagramComment,
    connection: InstagramConnection,
    now: Date,
  ): Promise<Handled> {
    if (this.graph === null) return this.finish(sendId, DmSendReason.NotConnected, false, now);
    const url = `${this.recipeLinkBase}/recipes/${rule.recipeId}`;
    const text = rule.render(comment.fromUsername ?? '', url);
    const sent = await this.graph.sendPrivateReply(connection.igUserId, connection.accessToken, comment.commentId, text, await this.cardFor(rule, comment, url));
    if (!sent.ok) {
      switch (sent.failure.code) {
        case 'too_many_requests':
          return { retry: sent.failure.messageKey, sendId, rateLimited: true };
        case 'unauthorized':
          await this.connections.save(connection.expired());
          return this.finish(sendId, DmSendReason.NotConnected, false, now);
        case 'unprocessable':
          return this.finish(sendId, DmSendReason.RecipientUnavailable, false, now);
        case 'forbidden':
          return this.finish(sendId, DmSendReason.PermissionMissing, false, now);
        default:
          this.logger.warn({ ruleId: rule.id, messageKey: sent.failure.messageKey }, 'instagram_private_reply_failed');
          return this.finish(sendId, DmSendReason.Upstream, false, now);
      }
    }
    let publicReplied = false;
    if (rule.publicReplyText !== null) {
      const replied = await this.graph.replyToComment(connection.accessToken, comment.commentId, rule.publicReplyText);
      publicReplied = replied.ok;
      if (!replied.ok) this.logger.warn({ ruleId: rule.id, messageKey: replied.failure.messageKey }, 'instagram_public_reply_failed');
    }
    return this.finish(sendId, null, publicReplied, now);
  }

  private async finish(sendId: string, reason: DmSendReasonType | null, publicReplied: boolean, now: Date): Promise<Handled> {
    const status = reason === null ? DmSendStatus.Sent : DmSendStatus.Failed;
    const saved = await this.sends.complete(sendId, { status, reason, publicReplied, at: now });
    if (!saved.ok) this.logger.warn({ sendId, messageKey: saved.failure.messageKey }, 'instagram_send_record_failed');
    return { sent: reason === null };
  }

  /**
   * Retries the event later — or, out of attempts, fails it AND closes the
   * attempt it claimed (rate_limited or upstream_error), so the creator's
   * activity never shows a send stuck at pending.
   */
  private async retryOrFail(event: QueuedInstagramEvent, handled: Extract<Handled, { retry: string }>, now: Date): Promise<void> {
    if (event.attempts >= MAX_EVENT_ATTEMPTS) {
      if (handled.sendId !== undefined) {
        await this.finish(handled.sendId, handled.rateLimited === true ? DmSendReason.RateLimited : DmSendReason.Upstream, false, now);
      }
      await this.queue.failed(event.id, handled.retry, now);
      return;
    }
    const minutes = Math.min(BACKOFF_CAP_MINUTES, 2 ** (event.attempts - 1));
    await this.queue.retryAt(event.id, new Date(now.getTime() + minutes * MINUTE_MS), handled.retry);
  }
}

function isOwnComment(comment: InstagramComment, connection: InstagramConnection): boolean {
  return comment.fromId === connection.igUserId || comment.fromUsername?.toLowerCase() === connection.username.toLowerCase();
}
