import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { RecipeCreatedListenerInterface } from '@application/recipes/ports/recipe-created-listener-interface';
import type { RecipeNutritionFiller } from '@application/recipes/nutrition/recipe-nutrition-filler';

/**
 * Calculates a new recipe's nutrition right after it is saved.
 *
 * @remarks
 * - **Why not wait for the sweep.** The sweep runs every ten minutes, five
 *   recipes at a time. A recipe saved and logged to the diary inside that
 *   window was logged with no calories, and the diary keeps what it was given.
 * - **Off the request path.** The calculation is a model call; the create
 *   answers first. A failure is logged and left to the sweep, which still
 *   finds the recipe because nothing was written.
 * - **Nothing is calculated twice.** A recipe that arrived with full nutrition
 *   (an import the model already measured) is left alone.
 */
export class FillNewRecipeNutrition implements RecipeCreatedListenerInterface {
  constructor(
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly filler: RecipeNutritionFiller,
    private readonly logger: LoggerInterface,
  ) {}

  created(recipeId: string): void {
    void this.fillNow(recipeId).catch((err: unknown) => this.logger.warn({ err, recipeId }, 'nutrition_on_create_failed'));
  }

  /** The awaited half of `created`, for tests and anyone who must know it finished. */
  async fillNow(recipeId: string): Promise<boolean> {
    const found = await this.recipeRepo.getById(recipeId);
    if (!found.ok) return false;
    const recipe = found.value.recipe;
    if (!this.filler.needsNutrition(recipe)) return false;
    return this.filler.fill(recipe);
  }
}
