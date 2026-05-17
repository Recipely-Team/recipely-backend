import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface IRecipeLikeRepository {
  /** Idempotent. Returns ok even when the like already exists. */
  add(userId: string, recipeId: string): Promise<Result<void, Failure>>;
  /** Idempotent. Returns ok even when there's no row to delete. */
  remove(userId: string, recipeId: string): Promise<Result<void, Failure>>;
}
