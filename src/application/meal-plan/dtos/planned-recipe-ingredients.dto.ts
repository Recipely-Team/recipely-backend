/** One planned recipe's ingredient lines, with how many servings the range plans of it. */
export interface PlannedRecipeIngredientsDto {
  readonly recipeId: string;
  readonly recipeName: string;
  /** Summed over every plan row of this recipe in the range. */
  readonly plannedServings: number;
  /** The recipe's own yield; the client scales by `plannedServings / recipeServings`. */
  readonly recipeServings: number;
  /** Localized lines, as the recipe detail shows them. */
  readonly ingredients: readonly string[];
}
