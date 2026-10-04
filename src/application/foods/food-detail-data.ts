import type { FoodSourceType } from '@domain/foods/food-source';
import type { FoodUnitType } from '@domain/foods/food-unit';
import type { Per100Nutrients } from '@domain/foods/per-100-nutrients';
import type { ServingUnit } from '@domain/foods/serving-unit';

/** One variant of a product, as its detail page lists it. */
export interface FoodVariantData {
  readonly foodVariantId: string | null;
  readonly names: Readonly<Record<string, string>> | null;
  readonly per100: Per100Nutrients;
  readonly servingUnits: readonly ServingUnit[];
}

/**
 * **A product with every variant** — a curated food, or an Open Food Facts
 * product (one variant, no id, its barcode on the product).
 */
export interface FoodDetailData {
  readonly source: FoodSourceType;
  readonly foodId: string | null;
  readonly offBarcode: string | null;
  readonly category: string | null;
  readonly names: Readonly<Record<string, string>>;
  readonly brand: string | null;
  readonly packSize: string | null;
  readonly defaultUnit: FoodUnitType;
  readonly imageUrl: string | null;
  readonly variants: readonly FoodVariantData[];
}
