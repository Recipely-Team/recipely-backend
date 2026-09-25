/**
 * The macros a recipe carries per serving, beside its calorie count.
 *
 * Named once here because it was written out inline twice in `Recipe` and
 * again wherever anything wanted to pass it — four spellings of one shape, any
 * of which could gain a field the others did not. Calories are deliberately NOT
 * part of it: they live in their own non-null column with a default, and this
 * whole object is absent until something has been calculated.
 *
 * @remarks
 * - **`servingWeightGrams`** — the estimated COOKED weight of one serving. It is
 *   what turns the per-serving numbers into per-100 g ones on the client, and it
 *   rides in the same JSON column, so no migration was needed. Absent rather
 *   than guessed when the estimate falls outside {@link ServingWeightGrams}.
 */
export interface RecipeNutrition {
  readonly protein?: number | undefined;
  readonly carbs?: number | undefined;
  readonly fat?: number | undefined;
  readonly fiber?: number | undefined;
  readonly servingWeightGrams?: number | undefined;
}

/** The plausible range for one cooked serving, inclusive. */
export const ServingWeightGrams = {
  Min: 20,
  Max: 3000,
} as const;

/** A whole number of grams inside {@link ServingWeightGrams}. */
export const isPlausibleServingWeight = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= ServingWeightGrams.Min &&
  value <= ServingWeightGrams.Max;
