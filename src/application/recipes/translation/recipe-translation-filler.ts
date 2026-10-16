import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeTranslationRepositoryInterface } from '@domain/recipes/localization/recipe-translation-repository-interface';
import type { RecipeText } from '@domain/recipes/localization/recipe-text';
import { translationGapOf } from '@domain/recipes/localization/translation-gap-of';
import type { RecipeTranslatorInterface } from '@application/recipes/ports/recipe-translator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';

/** Languages per model call: a recipe in three more languages stays inside Groq's 8 000-token-a-minute ceiling. */
const LOCALES_PER_CALL = 3;

/**
 * Writes one recipe in every app language it is missing; returns how many it added.
 *
 * @remarks
 * - **A few languages per call, each stored as it arrives.** A failed call
 *   costs only its own languages; the rest are kept, and the sweep asks
 *   again for what is still missing.
 * - **Only missing languages are written** (`setTranslations` never
 *   overwrites), so an author's own words in a language always win.
 * - **Shared by the sweep and the new-recipe path**, like the nutrition filler.
 */
export class RecipeTranslationFiller {
  constructor(
    private readonly translations: RecipeTranslationRepositoryInterface,
    private readonly translator: RecipeTranslatorInterface,
    private readonly logger: LoggerInterface,
  ) {}

  needsTranslation(recipe: Recipe): boolean {
    return translationGapOf(recipe.toRaw()) !== null;
  }

  async fill(recipe: Recipe): Promise<number> {
    const gap = translationGapOf(recipe.toRaw());
    if (gap === null) return 0;
    let added = 0;
    for (let i = 0; i < gap.missing.length; i += LOCALES_PER_CALL) {
      const to = gap.missing.slice(i, i + LOCALES_PER_CALL);
      const translated = await this.translator.translate({ from: gap.from, to, text: gap.text });
      if (!translated.ok) {
        this.logger.warn({ recipeId: recipe.id, to, code: translated.failure.code }, 'recipe_translation_failed');
        continue;
      }
      const usable: Record<string, RecipeText> = {};
      for (const locale of to) {
        const text = translated.value[locale];
        if (text !== undefined) usable[locale] = text;
      }
      if (Object.keys(usable).length === 0) continue;
      const written = await this.translations.setTranslations(recipe.id, usable);
      if (!written.ok) {
        this.logger.warn({ recipeId: recipe.id, to }, 'recipe_translation_persist_failed');
        continue;
      }
      added += Object.keys(usable).length;
    }
    return added;
  }
}
