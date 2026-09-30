import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import { FoodLogEntry } from '@domain/diary/food-log-entry';
import { MEAL_SLOTS, type MealSlotType } from '@domain/diary/meal-slot';
import { Nutrients } from '@domain/diary/nutrients';
import type { DiaryEntryRecord } from '@domain/diary/food-diary-repository-interface';

/**
 * A `food_log_entries` row with its recipe's cover already resolved — the one
 * shape both the Prisma reads and the raw "recent foods" query produce.
 */
export interface FoodLogEntryRow {
  id: string;
  userId: string;
  date: Date;
  meal: string;
  name: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  recipeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  recipeImageUrl: string | null;
}

const isMealSlot = (value: string): value is MealSlotType => (MEAL_SLOTS as readonly string[]).includes(value);

export class FoodLogEntryRowMapper {
  static toDomain(row: FoodLogEntryRow): Result<DiaryEntryRecord, Failure> {
    if (!isMealSlot(row.meal)) return fail(new UnknownFailure(`Unknown meal slot '${row.meal}'`));
    const entry = FoodLogEntry.create({
      id: row.id,
      userId: row.userId,
      date: CalendarDate.fromDate(row.date),
      meal: row.meal,
      name: row.name,
      servings: row.servings,
      // Stored rows were bounds-checked on the way in; re-reading them must not
      // fail over a cap that changed since.
      nutrients: Nutrients.total({
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        fiber: row.fiber,
      }),
      recipeId: row.recipeId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    if (!entry.ok) return entry;
    return ok({ entry: entry.value, recipeImageUrl: row.recipeImageUrl });
  }

  static toDomainList(rows: readonly FoodLogEntryRow[]): Result<DiaryEntryRecord[], Failure> {
    const records: DiaryEntryRecord[] = [];
    for (const row of rows) {
      const mapped = FoodLogEntryRowMapper.toDomain(row);
      if (!mapped.ok) return mapped;
      records.push(mapped.value);
    }
    return ok(records);
  }
}
