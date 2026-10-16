import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { NutritionCalculatorInterface } from '@application/ai/ports/nutrition-calculator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';

/**
 * Calculates and stores one recipe's nutrition; true when it was written.
 *
 * @remarks
 * - **Shared by the sweep and the new-recipe path**, so both make the same
 *   decision about the same recipe.
 * - **A missing serving weight is filled on its own.** Macros and calories
 *   already stored (possibly typed by their author) are kept; only the weight
 *   the per-100 g figures need is added.
 * - **Empty nutrition is no nutrition** (`Recipe.hasNutrition()`): a stored `{}`
 *   gets the full calculation.
 * - **It writes only the nutrition columns.** Going through `update` would
 *   delete-and-recreate the recipe's media, renumbering its photos.
 */
export class RecipeNutritionFiller {
  constructor(
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly calculator: NutritionCalculatorInterface,
    private readonly logger: LoggerInterface,
  ) {}

  /** Mirrors `listNeedingNutrition`: no real nutrition, or no serving weight to scale it by. */
  needsNutrition(recipe: Recipe): boolean {
    return !recipe.hasNutrition() || recipe.toRaw().nutrition?.servingWeightGrams === undefined;
  }

  async fill(recipe: Recipe): Promise<boolean> {
    const raw = recipe.toRaw();
    const ingredients = raw.ingredients['en'] ?? (Object.values(raw.ingredients)[0] as string[] | undefined) ?? [];
    const instructions = raw.instructions['en'] ?? (Object.values(raw.instructions)[0] as string[] | undefined) ?? [];
    if (ingredients.length === 0) {
      this.logger.warn({ recipeId: recipe.id }, 'nutrition_fill_skip_no_ingredients');
      return false;
    }

    const calculated = await this.calculator.calculate({ ingredients, instructions, servings: raw.servings });
    if (!calculated.ok) {
      this.logger.warn({ recipeId: recipe.id, code: calculated.failure.code }, 'nutrition_fill_calc_failed');
      return false;
    }

    const { caloriesPerServing, ...nutrition } = calculated.value;
    const existing = recipe.hasNutrition() ? raw.nutrition : undefined;
    if (existing !== undefined && nutrition.servingWeightGrams === undefined) {
      this.logger.warn({ recipeId: recipe.id }, 'nutrition_fill_no_serving_weight');
      return false;
    }
    const written =
      existing !== undefined
        ? await this.recipeRepo.setNutrition(recipe.id, raw.caloriesPerServing, { ...existing, servingWeightGrams: nutrition.servingWeightGrams })
        : await this.recipeRepo.setNutrition(recipe.id, caloriesPerServing, nutrition);
    if (!written.ok) {
      this.logger.warn({ recipeId: recipe.id }, 'nutrition_fill_persist_failed');
      return false;
    }
    return true;
  }
}
