import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import { FoodLogEntry } from '@domain/diary/food-log-entry';
import { MEAL_SLOTS, type MealSlotType } from '@domain/diary/meal-slot';
import { Nutrients } from '@domain/diary/nutrients';
import { LoggedProduct } from '@domain/diary/logged-product';
import { isFoodSource } from '@domain/foods/food-source';
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
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  recipeId: string | null;
  productSource: string | null;
  foodVariantId: string | null;
  offBarcode: string | null;
  unitKey: string | null;
  unitAmount: number | null;
  /** The variant's food; selected by the recent queries only. */
  productFoodId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  recipeImageUrl: string | null;
}

/** A row's product, or `null` — also when the source is unknown or the unit missing. */
function productFromRow(row: FoodLogEntryRow): LoggedProduct | null {
  if (!isFoodSource(row.productSource) || row.unitKey === null || row.unitAmount === null) return null;
  return LoggedProduct.restore({
    source: row.productSource,
    foodVariantId: row.foodVariantId,
    offBarcode: row.offBarcode,
    unitKey: row.unitKey,
    unitAmount: row.unitAmount,
  });
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
      product: productFromRow(row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    if (!entry.ok) return entry;
    return ok({
      entry: entry.value,
      recipeImageUrl: row.recipeImageUrl,
      ...(row.productFoodId !== undefined ? { productFoodId: row.productFoodId } : {}),
    });
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
