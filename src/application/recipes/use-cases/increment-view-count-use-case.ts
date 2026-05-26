import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';

export interface IncrementViewCountInput {
  readonly recipeId: string;
}

export class IncrementViewCountUseCase {
  constructor(private readonly recipeRepo: IRecipeRepository) {}

  async execute(input: IncrementViewCountInput): Promise<Result<void, Failure>> {
    return this.recipeRepo.incrementViewCount(input.recipeId);
  }
}
