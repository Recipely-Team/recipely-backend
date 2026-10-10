import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import { MealPlanMapper } from '@application/meal-plan/mappers/meal-plan.mapper';
import type { MealPlanDto } from '@application/meal-plan/dtos/meal-plan.dto';

export interface GetMealPlanInput {
  readonly userId: string;
  readonly from: string;
  readonly to: string;
  readonly locale: string;
}

/**
 * The plan for an inclusive range of at most 14 days, by date, meal and
 * position. Rows whose recipe the user can no longer read are left out.
 */
export class GetMealPlanUseCase {
  constructor(private readonly repo: MealPlanRepositoryInterface) {}

  async execute(input: GetMealPlanInput): Promise<Result<MealPlanDto, Failure>> {
    const range = MealPlanRange.create(input.from, input.to);
    if (!range.ok) return range;
    return mapResult(await this.repo.listRange(input.userId, range.value), (records) => ({
      from: range.value.from.toString(),
      to: range.value.to.toString(),
      entries: records.map(({ entry, recipe }) => MealPlanMapper.toDto(entry, recipe, input.locale)),
    }));
  }
}
