import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { DmRuleLimits } from '@domain/instagram/dm-rule-limits';
import type { InstagramConnection } from '@domain/instagram/instagram-connection';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { InstagramCommentData, InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { InstagramEventInput, InstagramEventQueueInterface } from '@application/instagram/ports/instagram-event-queue-interface';
import type { CommentPollCursorInterface, CommentPollTarget } from '@application/instagram/ports/comment-poll-cursor-interface';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** Posts read per tick — bounds Graph calls and time per minute. */
export const POLL_MEDIA_PER_TICK = 20;
const COMMENTS_PER_PAGE = 50;
/** Pages read per post per tick; a burst larger than this is finished next tick. */
const PAGES_PER_MEDIA = 3;
/** After a rate limit the poller rests, doubling per repeat, up to an hour. */
const REST_CAP_MINUTES = 60;
const COMMENTS_FIELD = 'comments';

export interface PollInstagramCommentsResult {
  readonly polled: number;
  readonly queued: number;
}

/**
 * **The comment poller** (every minute in the API process, unless
 * INSTAGRAM_COMMENT_POLLING is off).
 *
 * @remarks
 * - Why it exists: Meta sends `comments` webhooks only to Live apps with
 *   Advanced Access, so while the app is in development none arrive. The
 *   poller reads the posts that have enabled rules and queues each new comment
 *   into the SAME queue, in the webhook's own shape — the worker cannot tell
 *   them apart, and `dm_sends`' one-send-per-comment rule keeps a comment
 *   that arrives both ways from being answered twice.
 * - New means at or after the target's `since` (just past the last comment
 *   queued; first poll: when the post's oldest enabled rule was made — no
 *   backfill of older comments) and within the 7-day private-reply window. The creator's own comments are not queued.
 * - Bounded: {@link POLL_MEDIA_PER_TICK} posts, least recently polled first,
 *   at most 3 pages of 50 comments each.
 * - A rate limit stops the tick and rests the poller with doubling backoff;
 *   a token Instagram refuses expires the connection; any other failure skips
 *   that post until its next turn.
 */
export class PollInstagramCommentsUseCase {
  private restUntil = 0;
  private rests = 0;

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
    const due = await this.cursors.listDue(now, POLL_MEDIA_PER_TICK);
    if (!due.ok) return due;

    let polled = 0;
    let queued = 0;
    for (const target of due.value) {
      const connection = await this.connections.findByUserId(target.userId);
      if (!connection.ok) return connection;
      if (connection.value === null || !connection.value.isUsable(now)) continue;
      const read = await this.read(this.graph, target, connection.value, now);
      if (read === 'rest') {
        this.rest(now);
        break;
      }
      polled += 1;
      queued += read;
    }
    if (polled > 0) this.rests = 0;
    return ok({ polled, queued });
  }

  /** Reads one post; answers how many comments it queued, or `rest` on a rate limit. */
  private async read(graph: InstagramGraphInterface, target: CommentPollTarget, connection: InstagramConnection, now: Date): Promise<number | 'rest'> {
    const floor = Math.max(target.since.getTime(), now.getTime() - DmRuleLimits.PrivateReplyWindowDays * DAY_MS);
    const fresh: InstagramCommentData[] = [];
    let after: string | null = null;
    for (let page = 0; page < PAGES_PER_MEDIA; page += 1) {
      const found = await graph.listComments(connection.accessToken, target.mediaId, COMMENTS_PER_PAGE, after);
      if (!found.ok) {
        if (found.failure.code === 'too_many_requests') return 'rest';
        if (found.failure.code === 'unauthorized') await this.connections.save(connection.expired());
        this.logger.warn({ mediaId: target.mediaId, messageKey: found.failure.messageKey }, 'instagram_comment_poll_failed');
        return 0;
      }
      const recent = found.value.items.filter((c) => c.timestamp !== null && c.timestamp.getTime() >= floor);
      fresh.push(...recent.filter((c) => c.fromId !== connection.igUserId && c.fromUsername?.toLowerCase() !== connection.username.toLowerCase()));
      // Comments come newest first; a page that reaches back past the floor ends the read.
      if (recent.length < found.value.items.length || found.value.after === null) break;
      after = found.value.after;
    }

    if (fresh.length > 0) {
      const events: InstagramEventInput[] = fresh.map((c) => ({
        igUserId: connection.igUserId,
        field: COMMENTS_FIELD,
        payload: { id: c.id, text: c.text, from: { id: c.fromId, username: c.fromUsername }, media: { id: target.mediaId } },
        eventTime: c.timestamp ?? now,
      }));
      const enqueued = await this.queue.enqueue(events, now);
      if (!enqueued.ok) return 0;
    }
    // The cursor never moves back: with nothing new it stays just before `since`.
    const newest = fresh.reduce((latest, c) => Math.max(latest, c.timestamp?.getTime() ?? 0), target.since.getTime() - 1);
    await this.cursors.advance(target.mediaId, connection.igUserId, new Date(newest), now);
    return fresh.length;
  }

  private rest(now: Date): void {
    this.rests += 1;
    const minutes = Math.min(REST_CAP_MINUTES, 2 ** (this.rests - 1));
    this.restUntil = now.getTime() + minutes * MINUTE_MS;
    this.logger.warn({ minutes }, 'instagram_comment_poll_rate_limited');
  }
}
