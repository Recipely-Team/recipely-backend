import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IRecipeLikeRepository } from '@domain/likes/i-recipe-like-repository';

export class UnlikeRecipeUseCase {
  constructor(private readonly likes: IRecipeLikeRepository) {}

  async execute(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    return this.likes.remove(userId, recipeId);
  }
}
