import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RecipeTranslationRepositoryInterface } from '@domain/recipes/localization/recipe-translation-repository-interface';
import { RECIPE_LOCALES } from '@domain/recipes/localization/recipe-locales';
import type { RecipeTranslationFiller } from '@application/recipes/translation/recipe-translation-filler';

export interface SweepRecipeTranslationsResult {
  readonly recipes: number;
  readonly localesAdded: number;
}

/**
 * Writes a small batch of recipes in the app languages they lack.
 *
 * @remarks
 * - **Why a sweep at all.** Recipes saved before this existed hold one or two
 *   languages, and a translation that failed on create needs a second try.
 * - **A batch on a timer, never a drain.** Each recipe is several model calls;
 *   emptying a backlog at boot would be a burst of them.
 * - **Published recipes first**, then the newest: those are the ones read.
 */
export class SweepRecipeTranslationsUseCase {
  constructor(
    private readonly translations: RecipeTranslationRepositoryInterface,
    private readonly filler: RecipeTranslationFiller,
  ) {}

  async execute(batchSize: number): Promise<Result<SweepRecipeTranslationsResult, Failure>> {
    const batch = await this.translations.listNeedingTranslation(batchSize, RECIPE_LOCALES);
    if (!batch.ok) return batch;
    let localesAdded = 0;
    for (const recipe of batch.value) localesAdded += await this.filler.fill(recipe);
    return ok({ recipes: batch.value.length, localesAdded });
  }
}
