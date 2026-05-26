import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult, RecipeQuery, RecipeWithSocial } from '@domain/recipes/recipe-query';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';

export interface UserPreferences {
  readonly categories: RecipeCategory[];
  readonly cuisines: CuisineKey[];
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
}
