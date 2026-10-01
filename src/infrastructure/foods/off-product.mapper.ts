import { FoodSource } from '@domain/foods/food-source';
import { FoodUnit, type FoodUnitType } from '@domain/foods/food-unit';
import { ServingUnitKey } from '@domain/foods/serving-unit-key';
import type { FoodProductData } from '@application/foods/food-product-data';
import type { OffSearchHit } from '@infrastructure/foods/off-search-hit';

const BARCODE = /^\d{6,14}$/;
const QUANTITY = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i;
const TO_BASE: Readonly<Record<string, { readonly unit: FoodUnitType; readonly factor: number }>> = {
  g: { unit: FoodUnit.Gram, factor: 1 },
  kg: { unit: FoodUnit.Gram, factor: 1000 },
  ml: { unit: FoodUnit.Milliliter, factor: 1 },
  cl: { unit: FoodUnit.Milliliter, factor: 10 },
  l: { unit: FoodUnit.Milliliter, factor: 1000 },
};
/** Past this a package is a family pack, not something one person logs whole. */
const PACKAGE_MAX = 1000;
const KCAL_MAX = 900;
const GRAMS_MAX = 100;
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9, alcohol: 7 } as const;
/** How far the label's kcal may sit from what its macros add up to. */
const KCAL_TOLERANCE_ABS = 25;
const KCAL_TOLERANCE_REL = 0.3;

/**
 * **An Open Food Facts hit → product read model**, or `null` for one not worth
 * offering.
 *
 * @remarks
 * - Dropped: no barcode or name, no kcal, a kcal or gram value outside what
 *   100 g of anything can hold, or a kcal that its own macros contradict
 *   (protein·4 + carbs·4 + fat·9 + alcohol·7 more than ±25 kcal / ±30 % off) —
 *   the crowd-sourced data has "Cola, 450 kcal" in it, and a diary that trusts
 *   it is worse than one that shows fewer results.
 * - The base unit comes from the package `quantity` ("330 ml" → ml), which is
 *   also sent as `packSize`; a package of at most 1000 g/ml is offered as the
 *   `pack` serving unit.
 * - The name is stored under the request locale, the language it was asked in.
 */
export function offProductFromHit(hit: OffSearchHit, locale: string): FoodProductData | null {
  const name = hit.product_name?.trim() ?? '';
  const n = hit.nutriments ?? {};
  const kcal = n['energy-kcal_100g'];
  if (!BARCODE.test(hit.code) || name.length === 0 || kcal === undefined || kcal === null) return null;
  const grams = {
    protein: grams100(n.proteins_100g),
    carbs: grams100(n.carbohydrates_100g),
    fat: grams100(n.fat_100g),
    fiber: grams100(n.fiber_100g),
    sugar: grams100(n.sugars_100g),
    salt: grams100(n.salt_100g),
  };
  if (kcal < 0 || kcal > KCAL_MAX || Object.values(grams).includes(undefined)) return null;
  if (!kcalAgreesWithMacros(kcal, grams.protein ?? null, grams.carbs ?? null, grams.fat ?? null, n.alcohol_100g ?? 0)) return null;

  const pack = packOf(hit.quantity);
  const packSize = hit.quantity?.trim() ?? '';
  const brands = typeof hit.brands === 'string' ? hit.brands.split(',') : hit.brands ?? [];
  return {
    source: FoodSource.OpenFoodFacts,
    foodVariantId: null,
    offBarcode: hit.code,
    foodId: null,
    category: null,
    names: { [locale]: name },
    variantNames: null,
    variantCount: 1,
    brand: brands.map((brand) => brand.trim()).find((brand) => brand.length > 0) ?? null,
    packSize: packSize.length > 0 ? packSize : null,
    defaultUnit: pack?.unit ?? FoodUnit.Gram,
    per100: {
      calories: round(kcal),
      protein: grams.protein ?? null,
      carbs: grams.carbs ?? null,
      fat: grams.fat ?? null,
      fiber: grams.fiber ?? null,
      sugar: grams.sugar ?? null,
      salt: grams.salt ?? null,
    },
    servingUnits: pack !== null && pack.amount <= PACKAGE_MAX ? [{ key: ServingUnitKey.Pack, amount: pack.amount }] : [],
    imageUrl: hit.image_front_small_url ?? null,
  };
}

/** `undefined` marks an impossible value (the hit is dropped); `null` an unknown one. */
function grams100(value: number | null | undefined): number | null | undefined {
  if (value === undefined || value === null) return null;
  return value >= 0 && value <= GRAMS_MAX ? round(value) : undefined;
}

function kcalAgreesWithMacros(kcal: number, protein: number | null, carbs: number | null, fat: number | null, alcohol: number): boolean {
  if (protein === null || carbs === null || fat === null) return true;
  const fromMacros =
    protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat + alcohol * KCAL_PER_G.alcohol;
  return Math.abs(fromMacros - kcal) <= Math.max(KCAL_TOLERANCE_ABS, kcal * KCAL_TOLERANCE_REL);
}

function packOf(quantity: string | null | undefined): { readonly amount: number; readonly unit: FoodUnitType } | null {
  const match = QUANTITY.exec(quantity ?? '');
  const base = match?.[2] !== undefined ? TO_BASE[match[2].toLowerCase()] : undefined;
  if (match?.[1] === undefined || base === undefined) return null;
  const amount = round(Number(match[1].replace(',', '.')) * base.factor);
  return amount > 0 ? { amount, unit: base.unit } : null;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
