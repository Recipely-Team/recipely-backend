import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult, RecipeQuery, RecipeWithSocial } from '@domain/recipes/recipe-query';

export interface IRecipeRepository {
  list(query: RecipeQuery): Promise<Result<RecipePageResult, Failure>>;
  getById(id: string, currentUserId?: string): Promise<Result<RecipeWithSocial, Failure>>;
  create(recipe: Recipe): Promise<Result<Recipe, Failure>>;
  update(recipe: Recipe): Promise<Result<Recipe, Failure>>;
  delete(id: string): Promise<Result<void, Failure>>;
}
