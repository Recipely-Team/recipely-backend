import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RecipeText } from '@domain/recipes/localization/recipe-text';

export interface TranslateRecipeInput {
  /** The language `text` is written in. */
  readonly from: string;
  readonly to: readonly string[];
  readonly text: RecipeText;
}

/** The recipe in each language asked for; a language the model got wrong is left out, never guessed. */
export type TranslateRecipeResult = Readonly<Record<string, RecipeText>>;

/** Writes a recipe's words in other languages; quantities, units and order stay as they are. */
export interface RecipeTranslatorInterface {
  translate(input: TranslateRecipeInput): Promise<Result<TranslateRecipeResult, Failure>>;
}
