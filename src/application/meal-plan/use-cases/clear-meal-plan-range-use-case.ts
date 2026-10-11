import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';

export interface ClearMealPlanRangeInput {
  readonly userId: string;
  readonly from: string;
  readonly to: string;
}

/** Removes every planned row in an inclusive range of at most 14 days; diary entries stay. */
export class ClearMealPlanRangeUseCase {
  constructor(private readonly repo: MealPlanRepositoryInterface) {}

  async execute(input: ClearMealPlanRangeInput): Promise<Result<void, Failure>> {
    const range = MealPlanRange.create(input.from, input.to);
    if (!range.ok) return range;
    return mapResult(await this.repo.deleteRange(input.userId, range.value), () => undefined);
  }
}
