import type { RecipeText } from '@domain/recipes/localization/recipe-text';

/** What a recipe still needs translating: the language to read from, its words, and the languages it lacks. */
export interface TranslationGap {
  readonly from: string;
  readonly text: RecipeText;
  readonly missing: readonly string[];
}
