import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { RecipeCreatedListenerInterface } from '@application/recipes/ports/recipe-created-listener-interface';
import type { RecipeTranslationFiller } from '@application/recipes/translation/recipe-translation-filler';

/**
 * Writes a new recipe in every app language right after it is saved, off the
 * request path. Whatever fails is left to the translation sweep, which finds
 * the recipe by the languages it still lacks.
 */
export class TranslateNewRecipe implements RecipeCreatedListenerInterface {
  constructor(
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly filler: RecipeTranslationFiller,
    private readonly logger: LoggerInterface,
  ) {}

  created(recipeId: string): void {
    void this.translateNow(recipeId).catch((err: unknown) => this.logger.warn({ err, recipeId }, 'recipe_translation_on_create_failed'));
  }

  /** The awaited half of `created`; the number of languages added. */
  async translateNow(recipeId: string): Promise<number> {
    const found = await this.recipeRepo.getById(recipeId);
    if (!found.ok) return 0;
    return this.filler.fill(found.value.recipe);
  }
}
