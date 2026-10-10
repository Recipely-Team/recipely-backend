import { randomUUID } from 'crypto';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';
import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import { nextPosition } from '@application/meal-plan/next-position';
import type { CopyMealPlanResultDto } from '@application/meal-plan/dtos/copy-meal-plan-result.dto';

export interface CopyMealPlanWeekInput {
  readonly userId: string;
  readonly fromWeekStart: string;
  readonly toWeekStart: string;
}

/**
 * Copies the seven days from `fromWeekStart` onto the seven days from
 * `toWeekStart`, day for day.
 *
 * @remarks
 * - **Any weekday may start a week**; the copy keeps the offset between them.
 * - **Plans, not meals**: copies are uneaten, and each lands at the end of its
 *   slot after whatever the target day already holds.
 * - **A full day turns the rest away** (`skipped`) rather than failing the
 *   whole copy; only rows whose recipe is still readable are copied.
 * - **The same week onto itself** is `errors.validation.meal_plan_range_invalid`.
 */
export class CopyMealPlanWeekUseCase {
  constructor(private readonly repo: MealPlanRepositoryInterface) {}

  async execute(input: CopyMealPlanWeekInput): Promise<Result<CopyMealPlanResultDto, Failure>> {
    const source = MealPlanRange.week(input.fromWeekStart);
    if (!source.ok) return source;
    const target = MealPlanRange.week(input.toWeekStart);
    if (!target.ok) return target;
    const offset = source.value.from.daysUntil(target.value.from);
    if (offset === 0) return fail(new ValidationFailure('errors.validation.meal_plan_range_invalid', 'toWeekStart'));

    const records = await this.repo.listRange(input.userId, source.value);
    if (!records.ok) return records;
    const existing = await this.repo.listEntries(input.userId, target.value);
    if (!existing.ok) return existing;

    const byDay = new Map<string, MealPlanEntry[]>();
    for (const row of existing.value) byDay.set(row.date.toString(), [...(byDay.get(row.date.toString()) ?? []), row]);

    const now = new Date();
    const copies: MealPlanEntry[] = [];
    let skipped = 0;
    for (const { entry } of records.value) {
      const date = entry.date.plusDays(offset);
      const day = byDay.get(date.toString()) ?? [];
      if (day.length >= MealPlanLimits.EntriesPerDayMax) {
        skipped += 1;
        continue;
      }
      const copy = entry.copyTo(randomUUID(), date, nextPosition(day, entry.meal), now);
      if (!copy.ok) return copy;
      byDay.set(date.toString(), [...day, copy.value]);
      copies.push(copy.value);
    }

    if (copies.length > 0) {
      const saved = await this.repo.insert(copies);
      if (!saved.ok) return saved;
    }
    return ok({ copied: copies.length, skipped });
  }
}
