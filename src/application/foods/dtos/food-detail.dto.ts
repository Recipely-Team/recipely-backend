import type { FoodSourceType } from '@domain/foods/food-source';
import type { FoodUnitType } from '@domain/foods/food-unit';
import type { FoodKindType } from '@domain/foods/food-kind';
import type { ServingUnit } from '@domain/foods/serving-unit';
import type { Per100Dto } from '@application/foods/dtos/per-100.dto';

/**
 * `GET /diary/foods/products/:id` and `/products/barcode/:barcode` — a product
 * with every variant and the serving units each offers.
 */
export interface FoodDetailDto {
  readonly source: FoodSourceType;
  readonly foodId: string | null;
  readonly offBarcode: string | null;
  readonly kind: FoodKindType;
  readonly category: string | null;
  readonly name: string;
  readonly brand: string | null;
  readonly packSize: string | null;
  readonly unit: FoodUnitType;
  readonly imageUrl: string | null;
  readonly variants: ReadonlyArray<{
    readonly foodVariantId: string | null;
    /** `null` for Open Food Facts' single variant. */
    readonly name: string | null;
    readonly per100: Per100Dto;
    readonly servingUnits: readonly ServingUnit[];
  }>;
}
