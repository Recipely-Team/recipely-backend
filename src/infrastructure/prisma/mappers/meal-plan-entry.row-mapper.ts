import type { MealPlanEntry as MealPlanEntryRow } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';

/**
 * `meal_plan_entries` rows → {@link MealPlanEntry}, and back to columns.
 * A row the entity refuses is reported as corrupt, not thrown.
 */
export class MealPlanEntryRowMapper {
  static toDomain(row: MealPlanEntryRow): Result<MealPlanEntry, Failure> {
    const entry = MealPlanEntry.create({ ...row, date: CalendarDate.fromDate(row.date) });
    return entry.ok ? entry : fail(new UnknownFailure(`corrupt meal_plan_entries row ${row.id}: ${entry.failure.messageKey}`));
  }

  static toDomainList(rows: readonly MealPlanEntryRow[]): Result<MealPlanEntry[], Failure> {
    const entries: MealPlanEntry[] = [];
    for (const row of rows) {
      const entry = MealPlanEntryRowMapper.toDomain(row);
      if (!entry.ok) return entry;
      entries.push(entry.value);
    }
    return ok(entries);
  }

  /** The columns an edit may change; the eaten link has its own conditional writes. */
  static mutableColumns(entry: MealPlanEntry) {
    return {
      date: entry.date.toDate(),
      meal: entry.meal,
      servings: entry.servings,
      position: entry.position,
      updatedAt: entry.updatedAt,
    };
  }

  static insertColumns(entry: MealPlanEntry) {
    return {
      id: entry.id,
      userId: entry.userId,
      recipeId: entry.recipeId,
      foodLogEntryId: entry.foodLogEntryId,
      createdAt: entry.createdAt,
      ...MealPlanEntryRowMapper.mutableColumns(entry),
    };
  }
}
