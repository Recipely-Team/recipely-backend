/** The words of a recipe in one language: everything a translation has to carry. */
export interface RecipeText {
  readonly name: string;
  readonly ingredients: readonly string[];
  readonly instructions: readonly string[];
  readonly tags: readonly string[];
  readonly mealType: readonly string[];
  readonly tips: readonly string[];
}
