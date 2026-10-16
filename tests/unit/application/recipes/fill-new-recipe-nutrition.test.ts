import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { NutritionCalculatorInterface } from '@application/ai/ports/nutrition-calculator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { RecipeOrigin } from '@domain/recipes/recipe-origin';
import { RecipeNutritionFiller } from '@application/recipes/nutrition/recipe-nutrition-filler';
import { FillNewRecipeNutrition } from '@application/recipes/nutrition/fill-new-recipe-nutrition';

/**
 * A recipe saved and logged to the diary before the ten-minute sweep reached
 * it went into the diary with no calories, and the diary keeps what it was
 * given. A new recipe is now measured as soon as it is saved.
 */

const recipeWith = (overrides: Partial<RecipeProps> = {}): Recipe => {
  const now = new Date('2026-10-15T00:00:00Z');
  const r = Recipe.create({
    origin: RecipeOrigin.User,
    id: 'r1',
    ownerId: 'owner-1',
    name: { en: 'Menemen' },
    cuisine: 'TURKISH',
    category: 'BREAKFAST',
    difficulty: 'EASY',
    ingredients: { en: ['3 eggs', '2 tomatoes'] },
    instructions: { en: ['Cook.'] },
    prepTimeMinutes: 5,
    cookTimeMinutes: 10,
    servings: 2,
    caloriesPerServing: 0,
    image: '',
    rating: 0,
    tags: { en: [] },
    mealType: { en: [] },
    media: [],
    isPublished: false,
    moderationStatus: 'unreviewed',
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  if (!r.ok) throw new Error(r.failure.messageKey);
  return r.value;
};

const setup = (recipe: Recipe | null, calcOk = true) => {
  const setNutrition = jest.fn(async () => ok(undefined));
  const repo = {
    getById: jest.fn(async () => (recipe ? ok({ recipe, social: {} }) : fail(new UnknownFailure('missing')))),
    setNutrition,
  } as unknown as RecipeRepositoryInterface;
  const calculator: NutritionCalculatorInterface = {
    calculate: jest.fn(async () =>
      calcOk
        ? ok({ caloriesPerServing: 310, protein: 18, carbs: 9, fat: 22, fiber: 2, servingWeightGrams: 240 })
        : fail(new UnknownFailure('model down')),
    ),
  } as unknown as NutritionCalculatorInterface;
  const logger = { warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as unknown as LoggerInterface;
  const filler = new RecipeNutritionFiller(repo, calculator, logger);
  return { fill: new FillNewRecipeNutrition(repo, filler, logger), setNutrition, calculator, logger };
};

describe('FillNewRecipeNutrition', () => {
  it('measures a recipe saved without nutrition at once', async () => {
    const { fill, setNutrition } = setup(recipeWith());
    await expect(fill.fillNow('r1')).resolves.toBe(true);
    expect(setNutrition).toHaveBeenCalledWith('r1', 310, expect.objectContaining({ protein: 18, servingWeightGrams: 240 }));
  });

  it('leaves a recipe that arrived fully measured alone', async () => {
    const measured = recipeWith({ caloriesPerServing: 400, nutrition: { protein: 20, carbs: 30, fat: 10, fiber: 3, servingWeightGrams: 300 } });
    const { fill, calculator } = setup(measured);
    await expect(fill.fillNow('r1')).resolves.toBe(false);
    expect(calculator.calculate).not.toHaveBeenCalled();
  });

  it('never fails the create: a model error is logged and left to the sweep', async () => {
    const { fill, setNutrition, logger } = setup(recipeWith(), false);
    expect(() => fill.created('r1')).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(setNutrition).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.anything(), 'nutrition_fill_calc_failed');
  });
});
