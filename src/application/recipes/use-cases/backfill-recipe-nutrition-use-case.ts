import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { INutritionCalculator } from '@application/ai/ports/i-nutrition-calculator';
import type { ILogger } from '@application/ports/i-logger';

export interface BackfillRecipeNutritionInput {
  readonly requesterId: string;
}

export interface BackfillRecipeNutritionResult {
  readonly updated: number;
  readonly failed: number;
}

const BATCH_SIZE = 20;

export class BackfillRecipeNutritionUseCase {
  constructor(
    private readonly recipeRepo: IRecipeRepository,
    private readonly authRepo: IAuthRepository,
    private readonly calculator: INutritionCalculator,
    private readonly logger: ILogger,
  ) {}

  async execute(input: BackfillRecipeNutritionInput): Promise<Result<BackfillRecipeNutritionResult, Failure>> {
    const roleResult = await this.authRepo.findRoleById(input.requesterId);
    if (!roleResult.ok) return roleResult;
    if (roleResult.value !== 'admin') {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    let updated = 0;
    let failed = 0;
    // Track every recipe ID we have already attempted (success or failure) so
    // that a full batch of consistently-failing recipes does not cause an
    // infinite loop: without exclusion, listWithoutNutrition would return the
    // same records on every iteration since their nutrition column stays null.
    const attemptedIds: string[] = [];

    for (;;) {
      const batch = await this.recipeRepo.listWithoutNutrition(BATCH_SIZE, attemptedIds);
      if (!batch.ok) return batch;
      if (batch.value.length === 0) break;

      for (const recipe of batch.value) {
        attemptedIds.push(recipe.id);
        const raw = recipe.toRaw();
        const ingredients =
          raw.ingredients['en'] ??
          (Object.values(raw.ingredients)[0] as string[] | undefined) ??
          [];

        if (ingredients.length === 0) {
          this.logger.warn({ recipeId: recipe.id }, 'backfill_nutrition_skip_no_ingredients');
          failed++;
          continue;
        }

        const nutritionResult = await this.calculator.calculate({
          ingredients,
          servings: raw.servings,
        });

        if (!nutritionResult.ok) {
          this.logger.warn(
            { recipeId: recipe.id, code: nutritionResult.failure.code },
            'backfill_nutrition_calc_failed',
          );
          failed++;
          continue;
        }

        const { caloriesPerServing, ...nutritionFields } = nutritionResult.value;
        const updatedRecipe = Recipe.create({
          ...raw,
          caloriesPerServing,
          nutrition: nutritionFields,
          updatedAt: new Date(),
        });

        if (!updatedRecipe.ok) {
          this.logger.warn({ recipeId: recipe.id }, 'backfill_nutrition_entity_failed');
          failed++;
          continue;
        }

        const persistResult = await this.recipeRepo.update(updatedRecipe.value);
        if (!persistResult.ok) {
          this.logger.warn({ recipeId: recipe.id }, 'backfill_nutrition_persist_failed');
          failed++;
          continue;
        }

        updated++;
      }

      if (batch.value.length < BATCH_SIZE) break;
    }

    this.logger.warn({ updated, failed }, 'backfill_nutrition_complete');
    return ok({ updated, failed });
  }
}
