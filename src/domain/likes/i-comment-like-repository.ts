import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface ICommentLikeRepository {
  /** Idempotent. Returns ok even when the like already exists. */
  add(userId: string, commentId: string): Promise<Result<void, Failure>>;
  /** Idempotent. Returns ok even when there's no row to delete. */
  remove(userId: string, commentId: string): Promise<Result<void, Failure>>;
}
