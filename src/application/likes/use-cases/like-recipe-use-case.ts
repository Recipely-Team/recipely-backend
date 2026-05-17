import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IRecipeLikeRepository } from '@domain/likes/i-recipe-like-repository';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';

export class LikeRecipeUseCase {
  constructor(
    private readonly likes: IRecipeLikeRepository,
    private readonly recipes: IRecipeRepository,
  ) {}

  async execute(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    // Verify the recipe exists before liking it.
    const recipeResult = await this.recipes.getById(recipeId);
    if (!recipeResult.ok) return recipeResult;

    return this.likes.add(userId, recipeId);
  }
}
