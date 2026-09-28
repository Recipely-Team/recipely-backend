import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult } from '@domain/recipes/query/recipe-page-result';
import type { RecipeQuery } from '@domain/recipes/query/recipe-query';
import type { RecipeWithSocial } from '@domain/recipes/query/recipe-with-social';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { ModerationStatus } from '@domain/moderation/moderation-status';
import type { RecipeMedia } from '@domain/recipes/recipe-media';
import type { NewRecipeMedia } from '@domain/recipes/new-recipe-media';
import type { RecipeNutrition } from '@domain/recipes/recipe-nutrition';
import type { CoverChange } from '@domain/recipes/editing/cover-change';

export interface UserPreferences {
  readonly categories: RecipeCategory[];
  readonly cuisines: CuisineKey[];
}

/** `promoteToCover`: also make the photo the cover, if the recipe has none at the moment of writing. */
export interface AddMediaOptions {
  readonly promoteToCover: boolean;
}

export interface ModeratedRecipe {
  readonly ownerId: string;
}

export interface RecipeRepositoryInterface {
  list(query: RecipeQuery): Promise<Result<RecipePageResult, Failure>>;
  getById(id: string, currentUserId?: string): Promise<Result<RecipeWithSocial, Failure>>;
  create(recipe: Recipe): Promise<Result<Recipe, Failure>>;
  update(recipe: Recipe): Promise<Result<Recipe, Failure>>;
  delete(id: string): Promise<Result<void, Failure>>;
  getPreferencesForUser(userId: string, limit?: number): Promise<Result<UserPreferences, Failure>>;
  /**
   * Recipes whose nutrition is absent, or present without a serving weight —
   * those with none at all come first. Within each group the order is random,
   * so a recipe no calculator can finish never holds the head of the queue.
   */
  listNeedingNutrition(limit: number, excludeIds?: readonly string[]): Promise<Result<Recipe[], Failure>>;
  incrementViewCount(recipeId: string): Promise<Result<void, Failure>>;

  /**
   * Appends one photo to a recipe that already exists.
   *
   * Deliberately NOT `update`: that one delete-and-recreates the whole media
   * set, so adding a photo would hand every existing one a new id and a new
   * position — a rewrite of the gallery to append to the end of it. This
   * touches nothing that is already there.
   */
  addMedia(recipeId: string, media: NewRecipeMedia, options?: AddMediaOptions): Promise<Result<RecipeMedia, Failure>>;

  /**
   * Writes the nutrition columns and nothing else.
   *
   * `update` would do it, and that is the problem: it delete-and-recreates the
   * whole media set, so filling in a calorie count would hand every photo on
   * the recipe a new id. A number the user never typed must not renumber their
   * gallery. Same reasoning as {@link setModerationStatus}.
   */
  setNutrition(
    id: string,
    caloriesPerServing: number,
    nutrition: RecipeNutrition,
  ): Promise<Result<void, Failure>>;

  /**
   * Sets the cover and drops the named gallery rows, together — a photo is
   * removed from wherever it appears in one write, or not at all. Only the
   * recipe's own rows go: a media id belonging to another recipe is ignored.
   * `not_found` for a missing or deleted recipe.
   */
  writeCover(recipeId: string, change: CoverChange): Promise<Result<void, Failure>>;

  /**
   * Writes an owner's edit: the text, times, taxonomy and moderation status,
   * and nothing else — never media, provenance or the imported fingerprint.
   * Only a live, PRIVATE row is written, checked in the same statement, so a
   * publish that lands between the read and this write cannot be edited
   * under; that race answers `conflict` (`errors.recipe.edit_published`).
   */
  saveContent(recipe: Recipe): Promise<Result<void, Failure>>;
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
