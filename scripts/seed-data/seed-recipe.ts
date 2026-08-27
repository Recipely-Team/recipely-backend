import type { CuisineKey, Difficulty, RecipeCategory } from '@prisma/client';

/**
 * One dish, written for this file.
 *
 * @remarks
 * - **`slug` is the identity.** Re-running the seed matches on it, so a fixed
 *   typo updates the row rather than adding a second copy of the dish.
 * - **`imageQuery` is separate from the name on purpose.** "Karnıyarık" finds
 *   nothing in a CC0 photo index; "moussaka" finds plenty. The name the user
 *   reads and the words that locate a picture are different problems.
 * - **Its FIRST word is the subject and must be the indexed one**, because the
 *   finder rejects any photograph whose title or tags do not name it. Words
 *   after the first only help ranking. Put the internationally-known term
 *   first — a Turkish-only name there means no image at all, which is the
 *   correct outcome but not the useful one.
 * - **Two languages, not nine.** `tr` and `en` are what CLAUDE.md rule 11
 *   requires kept in sync, and a machine-translated Swedish ingredient list
 *   would be worse than the app's own fallback.
 */
export interface SeedRecipe {
  slug: string;
  imageQuery: string;
  name: { tr: string; en: string };
  cuisine: CuisineKey;
  category: RecipeCategory;
  difficulty: Difficulty;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  caloriesPerServing: number;
  nutrition: { protein: number; carbs: number; fat: number; fiber: number };
  ingredients: { tr: string[]; en: string[] };
  instructions: { tr: string[]; en: string[] };
  tags: { tr: string[]; en: string[] };
  mealType: string[];
}
