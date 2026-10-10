/** The recipe a plan row points at, in the request's locale. */
export interface PlannedRecipeDto {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string | null;
  /** `null` when nutrition has not been calculated (stored as 0). */
  readonly caloriesPerServing: number | null;
  /** The recipe's own yield — what `plannedServings` scale against. */
  readonly servings: number;
  /** Prep + cook; `null` when neither is known. */
  readonly totalTimeMinutes: number | null;
}
