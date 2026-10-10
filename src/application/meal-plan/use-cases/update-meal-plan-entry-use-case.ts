import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import type { MealSlotType } from '@domain/diary/meal-slot';
import type { MealPlanEntryChange } from '@domain/meal-plan/meal-plan-entry';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';
import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import { MealPlanMapper } from '@application/meal-plan/mappers/meal-plan.mapper';
import { nextPosition } from '@application/meal-plan/next-position';
import type { MealPlanEntryDto } from '@application/meal-plan/dtos/meal-plan-entry.dto';

export interface UpdateMealPlanEntryInput {
  readonly id: string;
  readonly userId: string;
  readonly locale: string;
  readonly date?: string;
  readonly meal?: MealSlotType;
  readonly servings?: number;
  readonly position?: number;
}

/**
 * Moves, resizes or reorders one planned recipe. Someone else's row is
 * `errors.not_found.meal_plan_entry`.
 *
 * @remarks
 * - **Moving to another slot without a position** puts it at that slot's end.
 * - **Moving to another day** counts against that day's cap
 *   (`errors.conflict.meal_plan_day_full`).
 * - **An eaten row keeps its diary entry**: the diary is the record of what
 *   was eaten, and the plan does not rewrite it.
 */
export class UpdateMealPlanEntryUseCase {
  constructor(private readonly repo: MealPlanRepositoryInterface) {}

  async execute(input: UpdateMealPlanEntryInput): Promise<Result<MealPlanEntryDto, Failure>> {
    let date: CalendarDate | undefined;
    if (input.date !== undefined) {
      const parsed = CalendarDate.parse(input.date);
      if (!parsed.ok) return parsed;
      date = parsed.value;
    }
    const found = await this.repo.find(input.id, input.userId);
    if (!found.ok) return found;
    const { entry, recipe } = found.value;

    const change: MealPlanEntryChange = {
      ...(date !== undefined ? { date } : {}),
      ...(input.meal !== undefined ? { meal: input.meal } : {}),
      ...(input.servings !== undefined ? { servings: input.servings } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    };

    let position = input.position;
    if (entry.movesSlot(change)) {
      const target = date ?? entry.date;
      const day = await this.repo.listEntries(input.userId, MealPlanRange.day(target));
      if (!day.ok) return day;
      const others = day.value.filter((row) => row.id !== entry.id);
      if (others.length >= MealPlanLimits.EntriesPerDayMax) {
        return fail(new ConflictFailure('errors.conflict.meal_plan_day_full'));
      }
      position ??= nextPosition(others, input.meal ?? entry.meal);
    }

    const changed = entry.apply({ ...change, ...(position !== undefined ? { position } : {}) }, new Date());
    if (!changed.ok) return changed;
    const saved = await this.repo.update(changed.value);
    if (!saved.ok) return saved;
    return ok(MealPlanMapper.toDto(changed.value, recipe, input.locale));
  }
}
