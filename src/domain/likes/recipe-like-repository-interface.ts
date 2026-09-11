import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RecipePageResult } from '@domain/recipes/query/recipe-page-result';

export interface RecipeLikeRepositoryInterface {
  /** Idempotent. Returns ok even when the like already exists. */
  add(userId: string, recipeId: string): Promise<Result<void, Failure>>;
  /** Idempotent. Returns ok even when there's no row to delete. */
  remove(userId: string, recipeId: string): Promise<Result<void, Failure>>;
  /** The recipes this user has liked, most recently liked first. */
  listForUser(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<Result<RecipePageResult, Failure>>;
}
