import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { NutritionCalculatorInterface } from '@application/ai/ports/nutrition-calculator-interface';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { LoggerInterface } from '@application/ports/logger-interface';

export interface CalculateRecipeNutritionInput {
  readonly recipeId: string;
  readonly requesterId: string;
  readonly locale: string;
}

export class CalculateRecipeNutritionUseCase {
  constructor(
    private readonly repo: RecipeRepositoryInterface,
    private readonly calculator: NutritionCalculatorInterface,
    private readonly logger: LoggerInterface,
  ) {}

  async execute(input: CalculateRecipeNutritionInput): Promise<Result<RecipeDto, Failure>> {
    // Pass requesterId so the owner can still fetch (and enrich) their own
    // unpublished/draft recipe — getById hides unpublished rows from others.
    const found = await this.repo.getById(input.recipeId, input.requesterId);
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

    const instructions =
      raw.instructions[locale] ??
      raw.instructions['en'] ??
      (Object.values(raw.instructions)[0] as string[] | undefined) ??
      [];

    const nutritionResult = await this.calculator.calculate({
      ingredients,
      instructions,
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
