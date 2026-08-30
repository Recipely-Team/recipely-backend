import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult, RecipeQuery, RecipeWithSocial } from '@domain/recipes/recipe-query';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { ModerationStatus } from '@domain/recipes/moderation-status';
import type { NewRecipeMedia, RecipeMedia } from '@domain/recipes/recipe-media';

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
   * Appends one photo to a recipe that already exists.
   *
   * Deliberately NOT `update`: that one delete-and-recreates the whole media
   * set, so adding a photo would hand every existing one a new id and a new
   * position — a rewrite of the gallery to append to the end of it. This
   * touches nothing that is already there.
   */
  addMedia(recipeId: string, media: NewRecipeMedia): Promise<Result<RecipeMedia, Failure>>;

  /** Removes one photo. Silent about a media id that belongs to another recipe. */
  removeMedia(recipeId: string, mediaId: string): Promise<Result<void, Failure>>;
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
