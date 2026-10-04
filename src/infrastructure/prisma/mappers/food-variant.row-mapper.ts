import { FoodSource } from '@domain/foods/food-source';
import { isFoodUnit } from '@domain/foods/food-unit';
import { isServingUnitKey } from '@domain/foods/serving-unit-key';
import type { Per100Nutrients } from '@domain/foods/per-100-nutrients';
import type { ServingUnit } from '@domain/foods/serving-unit';
import type { FoodProductData } from '@application/foods/food-product-data';

/** A `food_variants` row joined with its food, as the catalogue queries select it. */
export interface FoodVariantRow {
  readonly variantId: string;
  readonly variantNames: unknown;
  readonly variantCount: number;
  readonly kcal: number;
  readonly protein: number | null;
  readonly carbs: number | null;
  readonly fat: number | null;
  readonly fiber: number | null;
  readonly sugar: number | null;
  readonly salt: number | null;
  readonly servingUnits: unknown;
  readonly foodId: string;
  readonly category: string;
  readonly foodNames: unknown;
  readonly defaultUnit: string;
}

/**
 * **Catalogue row → product read model**, or `null` for a row the code cannot
 * read (unknown unit, names that are not a locale → text map) — the catalogue
 * is generated and tested, so that is a corruption to skip, not to fail on.
 * A serving unit that does not read is left out on its own.
 */
export function foodProductFromRow(row: FoodVariantRow): FoodProductData | null {
  const names = stringRecord(row.foodNames);
  const variantNames = stringRecord(row.variantNames);
  if (names === null || variantNames === null || !isFoodUnit(row.defaultUnit)) return null;
  return {
    source: FoodSource.Curated,
    foodVariantId: row.variantId,
    offBarcode: null,
    foodId: row.foodId,
    category: row.category,
    names,
    variantNames,
    variantCount: Number(row.variantCount),
    brand: null,
    packSize: null,
    defaultUnit: row.defaultUnit,
    per100: per100FromRow(row),
    servingUnits: servingUnitsFromJson(row.servingUnits),
    imageUrl: null,
  };
}

export function per100FromRow(row: Pick<FoodVariantRow, 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'salt'>): Per100Nutrients {
  return {
    calories: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    sugar: row.sugar,
    salt: row.salt,
  };
}

export function stringRecord(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, text]) => typeof text === 'string') ? (Object.fromEntries(entries) as Record<string, string>) : null;
}

export function servingUnitsFromJson(value: unknown): ServingUnit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): ServingUnit[] => {
    if (typeof item !== 'object' || item === null) return [];
    const { key, amount } = item as Record<string, unknown>;
    return isServingUnitKey(key) && typeof amount === 'number' && amount > 0 ? [{ key, amount }] : [];
  });
}
