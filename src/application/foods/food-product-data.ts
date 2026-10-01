import type { FoodSourceType } from '@domain/foods/food-source';
import type { FoodUnitType } from '@domain/foods/food-unit';
import type { Per100Nutrients } from '@domain/foods/per-100-nutrients';
import type { ServingUnit } from '@domain/foods/serving-unit';

/**
 * **One loggable product**, from the curated catalogue or Open Food Facts —
 * the read model both product ports answer with, so the search and the diary
 * treat them alike.
 *
 * @remarks
 * - Curated rows carry `foodVariantId`, `foodId`, a category and names per
 *   locale; Open Food Facts rows carry `offBarcode`, a brand and the one name
 *   the product has (under the locale it was read in).
 */
export interface FoodProductData {
  readonly source: FoodSourceType;
  readonly foodVariantId: string | null;
  readonly offBarcode: string | null;
  readonly foodId: string | null;
  readonly category: string | null;
  /** The food's name per locale. */
  readonly names: Readonly<Record<string, string>>;
  /** The variant's name per locale ("Low-fat"); `null` for Open Food Facts. */
  readonly variantNames: Readonly<Record<string, string>> | null;
  /** How many variants the food has — the app shows "Ayran · Low-fat" only when more than one. */
  readonly variantCount: number;
  readonly brand: string | null;
  /** The package as labelled ("330 ml"); Open Food Facts only. */
  readonly packSize: string | null;
  readonly defaultUnit: FoodUnitType;
  readonly per100: Per100Nutrients;
  readonly servingUnits: readonly ServingUnit[];
  readonly imageUrl: string | null;
}
