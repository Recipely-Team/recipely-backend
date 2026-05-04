import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IFavoriteRepository } from '@domain/favorites/i-favorite-repository';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';

export class AddFavoriteUseCase {
  constructor(
    private readonly favorites: IFavoriteRepository,
    private readonly recipes: IRecipeRepository,
  ) {}

  async execute(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    // Surface a 404 if the recipe doesn't exist; otherwise the FK error from
    // the favorites insert would leak as a generic 500.
    const recipe = await this.recipes.getById(recipeId);
    if (!recipe.ok) return recipe;

    const result = await this.favorites.add(userId, recipeId);
    if (!result.ok) return result;
    return ok(undefined);
  }
}
