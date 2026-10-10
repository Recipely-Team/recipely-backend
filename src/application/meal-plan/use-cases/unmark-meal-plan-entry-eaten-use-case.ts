import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import { MealPlanMapper } from '@application/meal-plan/mappers/meal-plan.mapper';
import type { MealPlanEntryDto } from '@application/meal-plan/dtos/meal-plan-entry.dto';

export interface UnmarkMealPlanEntryEatenInput {
  readonly id: string;
  readonly userId: string;
  readonly locale: string;
}

/**
 * Undoes "eaten": deletes the diary entry it was logged as (when it still
 * exists) and clears the link. A row that is not eaten answers as it is.
 */
export class UnmarkMealPlanEntryEatenUseCase {
  constructor(
    private readonly repo: MealPlanRepositoryInterface,
    private readonly diary: FoodDiaryRepositoryInterface,
  ) {}

  async execute(input: UnmarkMealPlanEntryEatenInput): Promise<Result<MealPlanEntryDto, Failure>> {
    const found = await this.repo.find(input.id, input.userId);
    if (!found.ok) return found;
    const { entry, recipe } = found.value;
    const linked = entry.foodLogEntryId;
    if (linked === null) return ok(MealPlanMapper.toDto(entry, recipe, input.locale));

    const removed = await this.diary.deleteEntry(linked, input.userId);
    // Already gone from the diary is the outcome wanted; anything else is a real failure.
    if (!removed.ok && removed.failure.code !== 'not_found') return removed;
    const cleared = await this.repo.unlinkEaten(entry.id, input.userId, linked);
    if (!cleared.ok) return cleared;

    const current = await this.repo.find(input.id, input.userId);
    if (!current.ok) return current;
    return ok(MealPlanMapper.toDto(current.value.entry, current.value.recipe, input.locale));
  }
}
