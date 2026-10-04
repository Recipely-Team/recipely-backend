/**
 * Where a recipe's nutrition figures came from. Stored in
 * `recipes.nutrition_source`.
 *
 * @remarks
 * - **`null` means estimated** — a model's guess from the ingredient list,
 *   which is every recipe but the curated ones. A source is only named when
 *   the numbers were computed from it, ingredient by ingredient.
 * - `UsdaFdc` is USDA FoodData Central (Foundation + SR Legacy), public domain.
 */
export const NutritionSource = {
  UsdaFdc: 'USDA_FDC',
} as const;

export type NutritionSourceType = (typeof NutritionSource)[keyof typeof NutritionSource];

/** The source a stored value names, or `null` for anything this build has no word for. */
export const toNutritionSource = (raw: string | null | undefined): NutritionSourceType | null =>
  (Object.values(NutritionSource) as unknown[]).includes(raw) ? (raw as NutritionSourceType) : null;
