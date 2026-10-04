/** Nutrients per 100 g or 100 ml of a product's base unit; macros `null` when unknown. */
export interface Per100Dto {
  readonly kcal: number;
  readonly protein: number | null;
  readonly carbs: number | null;
  readonly fat: number | null;
  readonly fiber: number | null;
}
