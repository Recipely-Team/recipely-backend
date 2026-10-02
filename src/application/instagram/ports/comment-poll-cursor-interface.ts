import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/** A post the poller should read: whose it is, and from when. */
export interface CommentPollTarget {
  readonly userId: string;
  readonly mediaId: string;
  /** Comments at or after this are new: the last one queued, or (first poll) when the oldest enabled rule was made. */
  readonly since: Date;
}

/**
 * The comment poller's bookkeeping: which posts to read, and how far each was
 * read. A post is a target while it has an enabled rule and its owner's
 * connection is active and unexpired.
 */
export interface CommentPollCursorInterface {
  /** Up to `limit` targets, least recently polled first (never-polled first of all). */
  listDue(now: Date, limit: number): Promise<Result<CommentPollTarget[], Failure>>;
  /** Records a read of the post: comments up to `lastSeenAt` are queued. */
  advance(mediaId: string, igUserId: string, lastSeenAt: Date, polledAt: Date): Promise<Result<void, Failure>>;
}
