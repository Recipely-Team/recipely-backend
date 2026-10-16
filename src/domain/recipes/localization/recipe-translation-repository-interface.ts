import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeText } from '@domain/recipes/localization/recipe-text';

/**
 * Where a recipe's other languages are read from and written to — apart from
 * the recipe repository because a translation touches only the text columns.
 */
export interface RecipeTranslationRepositoryInterface {
  /** Live recipes without a name in one of `locales`: published first, then at random, so a stuck one never holds the head. */
  listNeedingTranslation(limit: number, locales: readonly string[]): Promise<Result<Recipe[], Failure>>;

  /**
   * Adds each language to the text columns, in one write. A language the
   * recipe already has is left as it is: an author's own words win.
   */
  setTranslations(recipeId: string, byLocale: Readonly<Record<string, RecipeText>>): Promise<Result<void, Failure>>;
}
