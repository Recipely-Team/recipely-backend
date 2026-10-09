import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/** A creator's follower count on one UTC day. */
export interface FollowerPoint {
  /** `YYYY-MM-DD`. */
  readonly day: string;
  readonly followers: number;
}

/**
 * **Daily follower snapshots** — Instagram answers only today's count, so the
 * trend is what we wrote down ourselves, one row per creator per UTC day.
 */
export interface FollowerSnapshotRepositoryInterface {
  /** Writes (or rewrites) the creator's row for `day`. */
  record(userId: string, day: string, followers: number, mediaCount: number): Promise<Result<void, Failure>>;
  /** Creators with an active Instagram connection and no row for `day` yet, up to `limit`. */
  listMissing(day: string, limit: number): Promise<Result<string[], Failure>>;
  /** The creator's points from `fromDay` on, oldest first. */
  listSince(userId: string, fromDay: string): Promise<Result<FollowerPoint[], Failure>>;
  /** The creator's first ever day, or null before the first snapshot. */
  firstDay(userId: string): Promise<Result<string | null, Failure>>;
}
