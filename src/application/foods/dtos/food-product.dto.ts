import type { FoodSourceType } from '@domain/foods/food-source';
import type { FoodUnitType } from '@domain/foods/food-unit';
import type { FoodKindType } from '@domain/foods/food-kind';
import type { ServingUnit } from '@domain/foods/serving-unit';
import type { Per100Dto } from '@application/foods/dtos/per-100.dto';

/** One loggable product variant — a row of the products group and the Products tab. */
export interface FoodProductDto {
  readonly source: FoodSourceType;
  /** The curated food (open its detail with it); `null` for Open Food Facts. */
  readonly foodId: string | null;
  /** Set for `curated`; log with it. */
  readonly foodVariantId: string | null;
  /** Set for `openfoodfacts`; log with it, and open its detail by barcode. */
  readonly offBarcode: string | null;
  readonly kind: FoodKindType;
  readonly category: string | null;
  /** The food's name in the request locale (falls back to English). */
  readonly name: string;
  /** The variant's name ("Az yağlı"); `null` for Open Food Facts. */
  readonly variantName: string | null;
  /** Variants the food has; the app shows "name · variantName" only when more than one. */
  readonly variantCount: number;
  readonly brand: string | null;
  /** The package as labelled ("330 ml"); Open Food Facts only. */
  readonly packSize: string | null;
  /** The base unit `per100` and serving amounts are in. */
  readonly unit: FoodUnitType;
  readonly per100: Per100Dto;
  readonly servingUnits: readonly ServingUnit[];
  readonly imageUrl: string | null;
}
