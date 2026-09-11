import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FavoriteRepositoryInterface } from '@domain/favorites/favorite-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';

export class AddFavoriteUseCase {
  constructor(
    private readonly favorites: FavoriteRepositoryInterface,
    private readonly recipes: RecipeRepositoryInterface,
  ) {}

  async execute(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    // Surface a 404 if the recipe doesn't exist; otherwise the FK error from
    // the favorites insert would leak as a generic 500. Pass userId so the
    // owner can still favorite their own unpublished recipe — getById hides
    // unpublished rows from everyone else.
    const recipe = await this.recipes.getById(recipeId, userId);
    if (!recipe.ok) return recipe;

    const result = await this.favorites.add(userId, recipeId);
    if (!result.ok) return result;
    return ok(undefined);
  }
}
