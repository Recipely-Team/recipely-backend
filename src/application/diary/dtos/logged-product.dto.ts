import type { FoodSourceType } from '@domain/foods/food-source';

/** The product a diary entry was logged from, and the unit its `servings` counts. */
export interface LoggedProductDto {
  readonly source: FoodSourceType;
  readonly foodVariantId: string | null;
  readonly offBarcode: string | null;
  /** 'g', 'ml', or a serving-unit key. */
  readonly unitKey: string;
  /** Base g/ml in one unit (1 for 'g' / 'ml'). */
  readonly unitAmount: number;
}
