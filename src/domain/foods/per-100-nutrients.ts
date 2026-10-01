/**
 * A product's composition per 100 g or 100 ml of its default unit. Energy is
 * always known; every other value may be `null` (unknown, never zero).
 */
export interface Per100Nutrients {
  readonly calories: number;
  readonly protein: number | null;
  readonly carbs: number | null;
  readonly fat: number | null;
  readonly fiber: number | null;
  readonly sugar: number | null;
  readonly salt: number | null;
}
