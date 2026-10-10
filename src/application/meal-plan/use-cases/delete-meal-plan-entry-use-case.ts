import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';

export interface DeleteMealPlanEntryInput {
  readonly id: string;
  readonly userId: string;
}

/**
 * Removes one planned recipe. The diary entry it was eaten as stays: the
 * diary records what was eaten, the plan only what was intended.
 */
export class DeleteMealPlanEntryUseCase {
  constructor(private readonly repo: MealPlanRepositoryInterface) {}

  execute(input: DeleteMealPlanEntryInput): Promise<Result<void, Failure>> {
    return this.repo.delete(input.id, input.userId);
  }
}
