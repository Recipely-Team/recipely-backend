import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/** A post the poller should read, and where its last read left off. */
export interface CommentPollTarget {
  readonly userId: string;
  readonly mediaId: string;
  /**
   * Comments at or after this are new: the last comment queued, but never
   * earlier than when the post's rule was (re-)enabled — no backfill.
   */
  readonly since: Date;
  /** Graph's cursor when the last read was cut short by its page budget; read on from here. */
  readonly resumeAfter: string | null;
  /** The newest comment time seen by the read being resumed, committed when it completes. */
  readonly resumeNewestAt: Date | null;
  /** Consecutive polls that found nothing new. */
  readonly emptyPolls: number;
}

/** The state a poll leaves a post's cursor in. */
export interface CommentPollState {
  readonly lastSeenAt: Date;
  readonly polledAt: Date;
  readonly resumeAfter: string | null;
  readonly resumeNewestAt: Date | null;
  readonly emptyPolls: number;
  /** When the post is next due; `null` = every tick. */
  readonly nextPollAt: Date | null;
}

/**
 * The comment poller's bookkeeping. A post is a target while it has an
 * enabled rule, its owner's connection is active and unexpired, and it is due.
 */
export interface CommentPollCursorInterface {
  /** Up to `limit` due targets, least recently polled first (never-polled first of all). */
  listDue(now: Date, limit: number): Promise<Result<CommentPollTarget[], Failure>>;
  save(mediaId: string, igUserId: string, state: CommentPollState): Promise<Result<void, Failure>>;
  /** Marks a read that failed or was skipped as polled, so the post goes to the back of the line; the rest stays. */
  touch(mediaId: string, igUserId: string, since: Date, polledAt: Date): Promise<Result<void, Failure>>;
}
