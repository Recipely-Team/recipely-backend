import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { RecipeWithSocial } from '@domain/recipes/recipe-query';
import type { INutritionCalculator, NutritionInput, NutritionResult } from '@application/ai/ports/i-nutrition-calculator';
import type { ILogger } from '@application/ports/i-logger';
import {
  CalculateRecipeNutritionUseCase,
  type CalculateRecipeNutritionInput,
} from '@application/recipes/use-cases/calculate-recipe-nutrition-use-case';

// ---- fixtures ----------------------------------------------------------------

const RECIPE_ID = 'recipe-uuid';
const OWNER_ID = 'owner-uuid';

const NUTRITION: NutritionResult = {
  caloriesPerServing: 512,
  protein: 20,
  carbs: 60,
  fat: 18,
  fiber: 4,
};

function makeRecipe(overrides: Partial<RecipeProps> = {}): Recipe {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = Recipe.create({
    id: RECIPE_ID,
    ownerId: OWNER_ID,
    name: { en: 'Carbonara' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'eggs'], tr: ['makarna', 'yumurta'] },
    instructions: { en: ['boil'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/img.jpg',
    rating: 4,
    tags: { en: [] },
    mealType: { en: [] },
    media: [],
    isPublished: true,
    moderationStatus: 'approved',
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

function makeWithSocial(recipe: Recipe = makeRecipe()): RecipeWithSocial {
  return { recipe, social: { likeCount: 0, likedByMe: false, commentCount: 0 } };
}

// ---- mocks ------------------------------------------------------------------

interface RepoOptions {
  getByIdResult?: Result<RecipeWithSocial, Failure>;
  updateResult?: Result<Recipe, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IRecipeRepository;
  updateCalls: () => Recipe[];
} {
  const updateCalls: Recipe[] = [];

  const repo: IRecipeRepository = {
    list: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),

    async getById(): Promise<Result<RecipeWithSocial, Failure>> {
      return options.getByIdResult ?? ok(makeWithSocial());
    },

    async update(recipe): Promise<Result<Recipe, Failure>> {
      updateCalls.push(recipe);
      return options.updateResult ?? ok(recipe);
    },
  };

  return { repo, updateCalls: () => updateCalls };
}

function makeCalculator(
  result: Result<NutritionResult, Failure> = ok(NUTRITION),
): { calculator: INutritionCalculator; calculateCalls: () => NutritionInput[] } {
  const calculateCalls: NutritionInput[] = [];
  const calculator: INutritionCalculator = {
    async calculate(input): Promise<Result<NutritionResult, Failure>> {
      calculateCalls.push(input);
      return result;
    },
  };
  return { calculator, calculateCalls: () => calculateCalls };
}

function makeLogger(): { logger: ILogger; warnCalls: () => string[] } {
  const warnCalls: string[] = [];
  const logger: ILogger = {
    warn(_context, message): void {
      warnCalls.push(message);
    },
  };
  return { logger, warnCalls: () => warnCalls };
}

function makeInput(overrides: Partial<CalculateRecipeNutritionInput> = {}): CalculateRecipeNutritionInput {
  return { recipeId: RECIPE_ID, requesterId: OWNER_ID, locale: 'en', ...overrides };
}

// ---- tests ------------------------------------------------------------------

describe('CalculateRecipeNutritionUseCase — happy path', () => {
  it('returns the updated DTO with new calories and nutrition fields', async () => {
    const { repo } = makeRepo();
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caloriesPerServing).toBe(512);
    expect(result.value.nutrition).toEqual({ protein: 20, carbs: 60, fat: 18, fiber: 4 });
  });

  it('persists the recipe with the calculated nutrition', async () => {
    const { repo, updateCalls } = makeRepo();
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    await useCase.execute(makeInput());

    expect(updateCalls()).toHaveLength(1);
    const persisted = updateCalls()[0]!.toRaw();
    expect(persisted.caloriesPerServing).toBe(512);
    expect(persisted.nutrition).toEqual({ protein: 20, carbs: 60, fat: 18, fiber: 4 });
  });

  it('sends the locale-specific ingredients to the calculator', async () => {
    const { repo } = makeRepo();
    const { calculator, calculateCalls } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    await useCase.execute(makeInput({ locale: 'tr' }));

    expect(calculateCalls()).toEqual([{ ingredients: ['makarna', 'yumurta'], servings: 2 }]);
  });

  it('falls back to English ingredients when the locale is missing', async () => {
    const { repo } = makeRepo();
    const { calculator, calculateCalls } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    await useCase.execute(makeInput({ locale: 'de' }));

    expect(calculateCalls()).toEqual([{ ingredients: ['pasta', 'eggs'], servings: 2 }]);
  });

  it('falls back to the first available locale when English is also missing', async () => {
    const recipe = makeRecipe({ ingredients: { tr: ['makarna'] } });
    const { repo } = makeRepo({ getByIdResult: ok(makeWithSocial(recipe)) });
    const { calculator, calculateCalls } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    await useCase.execute(makeInput({ locale: 'de' }));

    expect(calculateCalls()).toEqual([{ ingredients: ['makarna'], servings: 2 }]);
  });
});

describe('CalculateRecipeNutritionUseCase — authorization', () => {
  it('returns ForbiddenFailure when the requester is not the owner', async () => {
    const { repo, updateCalls } = makeRepo();
    const { calculator, calculateCalls } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    const result = await useCase.execute(makeInput({ requesterId: 'someone-else' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
    expect(calculateCalls()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
  });
});

describe('CalculateRecipeNutritionUseCase — failures', () => {
  it('propagates NotFoundFailure when the recipe does not exist', async () => {
    const { repo } = makeRepo({ getByIdResult: fail(new NotFoundFailure('errors.not_found.recipe')) });
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });

  it('propagates the calculator failure and logs a warning', async () => {
    const calcFailure = new UnknownFailure('errors.ai.nutrition_failed');
    const { repo, updateCalls } = makeRepo();
    const { calculator } = makeCalculator(fail(calcFailure));
    const { logger, warnCalls } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(calcFailure);
    expect(warnCalls()).toContain('calculate_nutrition_failed');
    expect(updateCalls()).toHaveLength(0);
  });

  it('propagates the failure when persisting the updated recipe fails', async () => {
    const persistFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ updateResult: fail(persistFailure) });
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new CalculateRecipeNutritionUseCase(repo, calculator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(persistFailure);
  });
});
