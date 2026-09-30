/**
 * Where a recipe's text came from.
 *
 * @remarks
 * - **A fact the row carries, not one the reader derives.** It was derivable
 *   twice over and recorded neither time: an import left a `sourceUrl` the
 *   publish path never wrote, and a generation left an `AIGenerationLog` whose
 *   `generatedRecipeId` is `null` at every call site. Answering "did a machine
 *   write this?" for a LIST of recipes meant a join against a log table per
 *   card, which is not something a feed can do.
 * - **Recorded where it is known**, which is when the draft is made — an import
 *   that a cook then edited for a week arrives at publish looking like anything
 *   else.
 */
export const RecipeOrigin = {
  /** A person wrote it out. */
  User: 'USER',
  /** A model wrote it, from a prompt. */
  Ai: 'AI',
  /** Lifted from a post somewhere else. */
  Import: 'IMPORT',
  /**
   * Published by Recipely itself, under the official account: text written
   * by us, nutrition computed from USDA FoodData Central, an openly licensed
   * photo with its credit. See `ImageCredit` and `NutritionSource`.
   */
  Curated: 'CURATED',
} as const;

export type RecipeOriginType = (typeof RecipeOrigin)[keyof typeof RecipeOrigin];
