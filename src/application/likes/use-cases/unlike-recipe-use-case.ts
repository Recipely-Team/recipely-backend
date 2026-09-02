import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { RecipeLikeRepositoryInterface } from '@domain/likes/recipe-like-repository-interface';

export class UnlikeRecipeUseCase {
  constructor(private readonly likes: RecipeLikeRepositoryInterface) {}

  async execute(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    return this.likes.remove(userId, recipeId);
  }
}
