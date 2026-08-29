import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult, RecipeQuery, RecipeWithSocial } from '@domain/recipes/recipe-query';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { ModerationStatus } from '@domain/recipes/moderation-status';

export interface UserPreferences {
  readonly categories: RecipeCategory[];
  readonly cuisines: CuisineKey[];
}

export interface ModeratedRecipe {
  readonly ownerId: string;
}

export interface IRecipeRepository {
  list(query: RecipeQuery): Promise<Result<RecipePageResult, Failure>>;
  getById(id: string, currentUserId?: string): Promise<Result<RecipeWithSocial, Failure>>;
  create(recipe: Recipe): Promise<Result<Recipe, Failure>>;
  update(recipe: Recipe): Promise<Result<Recipe, Failure>>;
  delete(id: string): Promise<Result<void, Failure>>;
  getPreferencesForUser(userId: string, limit?: number): Promise<Result<UserPreferences, Failure>>;
  listWithoutNutrition(limit: number, excludeIds?: readonly string[]): Promise<Result<Recipe[], Failure>>;
  incrementViewCount(recipeId: string): Promise<Result<void, Failure>>;
  /**
   * Admin-panel moderation decision. Targets only the two columns a decision
   * changes — unlike `update`, it never touches media or the localized JSON
   * fields, so it costs a single PK-indexed row update rather than a
   * delete-and-recreate of the media set.
   */
  setModerationStatus(
    id: string,
    status: ModerationStatus,
    isPublished: boolean,
  ): Promise<Result<ModeratedRecipe, Failure>>;
}
