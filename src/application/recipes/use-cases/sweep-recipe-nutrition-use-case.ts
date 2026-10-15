import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeNutritionFiller } from '@application/recipes/nutrition/recipe-nutrition-filler';

export interface SweepRecipeNutritionResult {
  readonly updated: number;
  readonly failed: number;
  /** Whether anything is still missing — the caller decides what to do about it. */
  readonly remaining: boolean;
  /**
   * Every recipe this pass looked at, successful or not.
   *
   * Returned rather than tracked internally because the caller owns the loop:
   * a recipe whose ingredients no calculator can read stays without nutrition,
   * so the next page would be the same page unless the ids already tried are
   * excluded from it.
   */
  readonly attemptedIds: readonly string[];
}

/**
 * Fills in the nutrition of recipes that have none — or that have it without a
 * serving weight — one batch at a time.
 *
 * @remarks
 * - **What counts as missing, and what is written**, is `RecipeNutritionFiller`'s
 *   call, shared with the new-recipe path (`FillNewRecipeNutrition`).
 * - **Why anything needed to.** Nothing ever computed this. Creating a recipe
 *   stores whatever nutrition the payload happened to carry and calculates
 *   none; the only two ways to get a number were an admin endpoint nobody
 *   called and a per-recipe endpoint the app does not know about. So 134 of
 *   161 published recipes said "no nutrition information yet" and always would
 *   have.
 * - **A batch, not a drain.** The admin backfill loops until the table is
 *   clean, which is right for a one-off. This one is on a timer, so it does a
 *   bounded amount of work and says whether there is more — a sweep that
 *   emptied the queue in one tick would be a burst of AI calls at every boot.
 * - **A failed recipe is skipped, not retried forever.** Ingredients that no
 *   calculator can read do not become a permanent hot loop: the caller passes
 *   the ids it has already tried, exactly as the backfill does, and the next
 *   process start is soon enough to try again.
 */
export class SweepRecipeNutritionUseCase {
  constructor(
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly filler: RecipeNutritionFiller,
  ) {}

  async execute(
    batchSize: number,
    attemptedIds: readonly string[] = [],
  ): Promise<Result<SweepRecipeNutritionResult, Failure>> {
    const batch = await this.recipeRepo.listNeedingNutrition(batchSize, attemptedIds);
    if (!batch.ok) return batch;

    let updated = 0;
    let failed = 0;
    const attempted: string[] = [];

    for (const recipe of batch.value) {
      attempted.push(recipe.id);
      if (await this.filler.fill(recipe)) updated++;
      else failed++;
    }

    return ok({
      updated,
      failed,
      remaining: batch.value.length === batchSize,
      attemptedIds: attempted,
    });
  }
}
