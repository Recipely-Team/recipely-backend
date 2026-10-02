import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';

/**
 * The recipe a rule sends must be the user's own (and readable — not deleted).
 * Anything else answers `errors.not_found.recipe`, like a recipe that never
 * existed. Whether it is public is checked at send time: a private recipe is
 * recorded as `recipe_unavailable` rather than DM'd as a dead link.
 */
export async function checkOwnRecipe(recipes: RecipeRepositoryInterface, recipeId: string, userId: string): Promise<Result<void, Failure>> {
  const found = await recipes.getById(recipeId, userId);
  if (!found.ok) return found.failure.code === 'not_found' ? fail(new NotFoundFailure('errors.not_found.recipe')) : found;
  return found.value.recipe.ownerId === userId ? ok(undefined) : fail(new NotFoundFailure('errors.not_found.recipe'));
}
