import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';

export interface IncrementViewCountInput {
  readonly recipeId: string;
}

export class IncrementViewCountUseCase {
  constructor(private readonly recipeRepo: RecipeRepositoryInterface) {}

  async execute(input: IncrementViewCountInput): Promise<Result<void, Failure>> {
    return this.recipeRepo.incrementViewCount(input.recipeId);
  }
}
