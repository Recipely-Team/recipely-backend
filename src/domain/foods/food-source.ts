/**
 * Where a product's numbers came from. Stored in `food_variants.source` and
 * `food_log_entries.product_source`, and sent to the app so it can credit
 * Open Food Facts.
 */
export const FoodSource = {
  /** Our own catalogue: typical-composition values (USDA FDC / TürKomp-like). */
  Curated: 'curated',
  /** A branded product read from Open Food Facts, by barcode. */
  OpenFoodFacts: 'openfoodfacts',
} as const;

export type FoodSourceType = (typeof FoodSource)[keyof typeof FoodSource];

export const isFoodSource = (v: unknown): v is FoodSourceType =>
  (Object.values(FoodSource) as unknown[]).includes(v);
