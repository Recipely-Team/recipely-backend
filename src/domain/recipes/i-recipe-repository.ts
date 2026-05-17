import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { PageResult, RecipeQuery } from '@domain/recipes/recipe-query';

export interface IRecipeRepository {
  list(query: RecipeQuery): Promise<Result<PageResult<Recipe>, Failure>>;
  getById(id: string): Promise<Result<Recipe, Failure>>;
  create(recipe: Recipe): Promise<Result<Recipe, Failure>>;
  update(recipe: Recipe): Promise<Result<Recipe, Failure>>;
  delete(id: string): Promise<Result<void, Failure>>;
}
