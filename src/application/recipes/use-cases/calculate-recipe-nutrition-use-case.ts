import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { INutritionCalculator } from '@application/ai/ports/i-nutrition-calculator';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { ILogger } from '@application/ports/i-logger';

export interface CalculateRecipeNutritionInput {
  readonly recipeId: string;
  readonly requesterId: string;
  readonly locale: string;
}

export class CalculateRecipeNutritionUseCase {
  constructor(
    private readonly repo: IRecipeRepository,
    private readonly calculator: INutritionCalculator,
    private readonly logger: ILogger,
  ) {}

  async execute(input: CalculateRecipeNutritionInput): Promise<Result<RecipeDto, Failure>> {
    const found = await this.repo.getById(input.recipeId);
    if (!found.ok) return found;

    const { recipe, social } = found.value;
    if (recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const raw = recipe.toRaw();
    const locale = input.locale;
    const ingredients =
      raw.ingredients[locale] ??
      raw.ingredients['en'] ??
      (Object.values(raw.ingredients)[0] as string[] | undefined) ??
      [];

    const nutritionResult = await this.calculator.calculate({
      ingredients,
      servings: raw.servings,
    });

    if (!nutritionResult.ok) {
      this.logger.warn(
        { recipeId: input.recipeId, code: nutritionResult.failure.code },
        'calculate_nutrition_failed',
      );
      return nutritionResult;
    }

    const { caloriesPerServing, ...nutritionFields } = nutritionResult.value;

    const updatedRecipe = Recipe.create({
      ...raw,
      caloriesPerServing,
      nutrition: nutritionFields,
      updatedAt: new Date(),
    });
    if (!updatedRecipe.ok) return updatedRecipe;

    const persisted = await this.repo.update(updatedRecipe.value);
    if (!persisted.ok) return persisted;

    return ok(RecipeMapper.toDto(persisted.value, locale, social));
  }
}
