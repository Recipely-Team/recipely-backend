import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { DmRuleLimits } from '@domain/instagram/dm-rule-limits';
import type { InstagramConnection } from '@domain/instagram/instagram-connection';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { InstagramCommentData, InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { InstagramEventQueueInterface } from '@application/instagram/ports/instagram-event-queue-interface';
import type { CommentPollCursorInterface, CommentPollTarget } from '@application/instagram/ports/comment-poll-cursor-interface';
import { GraphCallBudget } from '@application/instagram/delivery/graph-call-budget';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** Posts read per tick — bounds Graph calls and time per minute. */
export const POLL_MEDIA_PER_TICK = 20;
const COMMENTS_PER_PAGE = 50;
/** Pages read per post per tick; a longer backlog is resumed from Graph's cursor next tick. */
export const PAGES_PER_MEDIA = 3;
/** Graph calls the poller may make per account per hour, leaving the rest of the limit to the DMs. */
export const POLL_CALLS_PER_ACCOUNT_HOUR = 60;
/** After this many empty polls a post is read every {@link QUIET_INTERVAL_MS} instead of every tick. */
const QUIET_AFTER_EMPTY_POLLS = 3;
const QUIET_INTERVAL_MS = 5 * MINUTE_MS;
/** After a rate limit the poller rests, doubling per repeat, up to an hour. */
const REST_CAP_MINUTES = 60;
const COMMENTS_FIELD = 'comments';

export interface PollInstagramCommentsResult {
  readonly polled: number;
  readonly queued: number;
}

/** How one post's read ended. */
type ReadOutcome = 'read' | 'rest' | 'skipped';

/**
 * **The comment poller** (every minute in the API process, unless
 * INSTAGRAM_COMMENT_POLLING is off).
 *
 * @remarks
 * - Why: Meta sends `comments` webhooks only to Live apps with Advanced
 *   Access. The poller reads the posts that have enabled rules and queues each
 *   new comment into the same queue, in the webhook's shape, with the same
 *   `comments:<id>` dedupe key — a comment both paths see is queued once.
 * - New means at or after the target's `since`, inclusive (Instagram stamps
 *   whole seconds; the re-read comment is dropped by its dedupe key), never
 *   before the rule was (re-)enabled, and within the 7-day reply window.
 *   Comments come newest first; the creator's own are not queued.
 * - A backlog longer than {@link PAGES_PER_MEDIA} pages is not skipped: the
 *   cursor stays put, Graph's `after` is saved, and the next tick reads on
 *   from it; only a completed read moves `last_seen_at`.
 * - Quiet posts back off: after 3 empty polls a post is read every 5 minutes,
 *   and every tick again once a comment arrives.
 * - Budgets: {@link POLL_MEDIA_PER_TICK} posts a tick and
 *   {@link POLL_CALLS_PER_ACCOUNT_HOUR} calls per account per hour. A rate
 *   limit ends the tick and rests the poller, doubling while ticks keep
 *   hitting it. A refused token expires the connection. A failed or skipped
 *   post is still marked polled, so it cannot starve the others.
 */
export class PollInstagramCommentsUseCase {
  private restUntil = 0;
  private rests = 0;
  private readonly budget = new GraphCallBudget(POLL_CALLS_PER_ACCOUNT_HOUR);

  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly cursors: CommentPollCursorInterface,
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly queue: InstagramEventQueueInterface,
    private readonly logger: LoggerInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<Result<PollInstagramCommentsResult, Failure>> {
    const now = this.now();
    if (this.graph === null || now.getTime() < this.restUntil) return ok({ polled: 0, queued: 0 });
    this.budget.prune(now);
    const due = await this.cursors.listDue(now, POLL_MEDIA_PER_TICK);
    if (!due.ok) return due;

    let polled = 0;
    let queued = 0;
    for (const target of due.value) {
      const connection = await this.connections.findByUserId(target.userId);
      if (!connection.ok) return connection;
      if (connection.value === null || !connection.value.isUsable(now)) continue;
      const read = await this.read(this.graph, target, connection.value, now);
      if (read.outcome === 'rest') {
        this.rest(now);
        return ok({ polled, queued });
      }
      polled += 1;
      queued += read.queued;
    }
    this.rests = 0; // a tick that ended without a rate limit
    return ok({ polled, queued });
  }

  private async read(
    graph: InstagramGraphInterface,
    target: CommentPollTarget,
    connection: InstagramConnection,
    now: Date,
  ): Promise<{ readonly outcome: ReadOutcome; readonly queued: number }> {
    const skip = async (outcome: ReadOutcome) => {
      await this.cursors.touch(target.mediaId, connection.igUserId, target.since, now);
      return { outcome, queued: 0 };
    };
    const floor = Math.max(target.since.getTime(), now.getTime() - DmRuleLimits.PrivateReplyWindowDays * DAY_MS);
    const fresh: InstagramCommentData[] = [];
    let after = target.resumeAfter;
    let complete = false;
    for (let page = 0; page < PAGES_PER_MEDIA; page += 1) {
      if (!this.budget.take(connection.igUserId, now)) break;
      const found = await graph.listComments(connection.accessToken, target.mediaId, COMMENTS_PER_PAGE, after);
      if (!found.ok) {
        if (found.failure.code === 'too_many_requests') return { outcome: 'rest', queued: 0 };
        if (found.failure.code === 'unauthorized') await this.connections.save(connection.expired());
        this.logger.warn({ mediaId: target.mediaId, messageKey: found.failure.messageKey }, 'instagram_comment_poll_failed');
        return skip('skipped');
      }
      const recent = found.value.items.filter((c) => c.timestamp !== null && c.timestamp.getTime() >= floor);
      fresh.push(...recent.filter((c) => !isOwn(c, connection)));
      after = found.value.after;
      // Newest first (Instagram's order): a page reaching back past the floor, or
      // the last page, completes the read. Should a page ever come oldest first,
      // stopping early would lose the newest comments, so it is read to the end.
      const ascending = isAscending(found.value.items);
      if (ascending) this.logger.warn({ mediaId: target.mediaId }, 'instagram_comment_order_unexpected');
      if ((!ascending && recent.length < found.value.items.length) || after === null) {
        complete = true;
        break;
      }
    }
    if (fresh.length === 0 && !complete && after === target.resumeAfter) return skip('skipped'); // budget gone before any page

    let queued = 0;
    if (fresh.length > 0) {
      const enqueued = await this.queue.enqueue(fresh.map((c) => eventOf(c, target.mediaId, connection, now)), now);
      if (!enqueued.ok) {
        this.logger.warn({ mediaId: target.mediaId, messageKey: enqueued.failure.messageKey }, 'instagram_comment_poll_enqueue_failed');
        return skip('skipped');
      }
      queued = enqueued.value;
    }
    const newest = fresh.reduce((latest, c) => Math.max(latest, c.timestamp?.getTime() ?? 0), target.resumeNewestAt?.getTime() ?? target.since.getTime());
    const emptyPolls = queued > 0 ? 0 : target.emptyPolls + 1;
    await this.cursors.save(target.mediaId, connection.igUserId, {
      lastSeenAt: complete ? new Date(Math.max(newest, target.since.getTime())) : target.since,
      polledAt: now,
      resumeAfter: complete ? null : after,
      resumeNewestAt: complete ? null : new Date(newest),
      emptyPolls,
      nextPollAt: emptyPolls >= QUIET_AFTER_EMPTY_POLLS ? new Date(now.getTime() + QUIET_INTERVAL_MS) : null,
    });
    return { outcome: 'read', queued };
  }

  private rest(now: Date): void {
    this.rests += 1;
    const minutes = Math.min(REST_CAP_MINUTES, 2 ** (this.rests - 1));
    this.restUntil = now.getTime() + minutes * MINUTE_MS;
    this.logger.warn({ minutes }, 'instagram_comment_poll_rate_limited');
  }
}

function isAscending(items: readonly InstagramCommentData[]): boolean {
  const first = items[0]?.timestamp?.getTime();
  const last = items[items.length - 1]?.timestamp?.getTime();
  return first !== undefined && last !== undefined && first < last;
}

function isOwn(comment: InstagramCommentData, connection: InstagramConnection): boolean {
  return comment.fromId === connection.igUserId || comment.fromUsername?.toLowerCase() === connection.username.toLowerCase();
}

function eventOf(comment: InstagramCommentData, mediaId: string, connection: InstagramConnection, now: Date) {
  return {
    igUserId: connection.igUserId,
    field: COMMENTS_FIELD,
    payload: { id: comment.id, text: comment.text, from: { id: comment.fromId, username: comment.fromUsername }, media: { id: mediaId } },
    eventTime: comment.timestamp ?? now,
    dedupeKey: `${COMMENTS_FIELD}:${comment.id}`,
  };
}
