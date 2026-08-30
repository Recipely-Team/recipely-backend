/**
 * The macros a recipe carries per serving, beside its calorie count.
 *
 * Named once here because it was written out inline twice in `Recipe` and
 * again wherever anything wanted to pass it — four spellings of one shape, any
 * of which could gain a field the others did not. Calories are deliberately NOT
 * part of it: they live in their own non-null column with a default, and this
 * whole object is absent until something has been calculated.
 */
export interface RecipeNutrition {
  readonly protein?: number | undefined;
  readonly carbs?: number | undefined;
  readonly fat?: number | undefined;
  readonly fiber?: number | undefined;
}
