import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { PageResult } from '@domain/recipes/recipe-query';

export interface IFavoriteRepository {
  /** Idempotent. Returns ok even when the favorite already exists. */
  add(userId: string, recipeId: string): Promise<Result<void, Failure>>;
  /** Idempotent. Returns ok even when there's no row to delete. */
  remove(userId: string, recipeId: string): Promise<Result<void, Failure>>;
  listForUser(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<Result<PageResult<Recipe>, Failure>>;
}
