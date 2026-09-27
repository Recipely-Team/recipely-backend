import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { NutritionCalculatorInterface } from '@application/ai/ports/nutrition-calculator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';

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
 * - **A missing serving weight counts as missing nutrition.** The client shows
 *   per-100 g figures, which need the cooked weight of a serving; recipes
 *   calculated before that field existed are picked up here so they fill in
 *   over time. For those only the weight is added: the macros and calories
 *   already stored (possibly typed by their author) are kept as they are.
 * - **Empty nutrition is no nutrition.** A stored `{}` (or every macro ≤ 0 with
 *   0 calories) fails `Recipe.hasNutrition()` and gets the full calculation.
 *   Treating it as real once meant only a weight was written, so the recipe
 *   stayed "unavailable" forever and cost an AI call on every run.
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
 * - **It writes only the nutrition columns.** Going through `update` would
 *   delete-and-recreate each recipe's media, renumbering photo galleries as a
 *   side effect of a calorie count.
 */
export class SweepRecipeNutritionUseCase {
  constructor(
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly calculator: NutritionCalculatorInterface,
    private readonly logger: LoggerInterface,
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
      const raw = recipe.toRaw();
      const ingredients =
        raw.ingredients['en'] ?? (Object.values(raw.ingredients)[0] as string[] | undefined) ?? [];
      const instructions =
        raw.instructions['en'] ?? (Object.values(raw.instructions)[0] as string[] | undefined) ?? [];

      if (ingredients.length === 0) {
        this.logger.warn({ recipeId: recipe.id }, 'sweep_nutrition_skip_no_ingredients');
        failed++;
        continue;
      }

      const calculated = await this.calculator.calculate({
        ingredients,
        instructions,
        servings: raw.servings,
      });
      if (!calculated.ok) {
        this.logger.warn(
          { recipeId: recipe.id, code: calculated.failure.code },
          'sweep_nutrition_calc_failed',
        );
        failed++;
        continue;
      }

      const { caloriesPerServing, ...nutrition } = calculated.value;
      const existing = recipe.hasNutrition() ? raw.nutrition : undefined;
      if (existing !== undefined && nutrition.servingWeightGrams === undefined) {
        this.logger.warn({ recipeId: recipe.id }, 'sweep_nutrition_no_serving_weight');
        failed++;
        continue;
      }
      const written =
        existing !== undefined
          ? await this.recipeRepo.setNutrition(recipe.id, raw.caloriesPerServing, {
              ...existing,
              servingWeightGrams: nutrition.servingWeightGrams,
            })
          : await this.recipeRepo.setNutrition(recipe.id, caloriesPerServing, nutrition);
      if (!written.ok) {
        this.logger.warn({ recipeId: recipe.id }, 'sweep_nutrition_persist_failed');
        failed++;
        continue;
      }

      updated++;
    }

    return ok({
      updated,
      failed,
      remaining: batch.value.length === batchSize,
      attemptedIds: attempted,
    });
  }
}
