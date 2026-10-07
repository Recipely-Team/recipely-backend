/** kcal and grams for one portion of one meal-parse item. */
export interface NutrientsPerPortionDto {
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  readonly fiber: number;
}
