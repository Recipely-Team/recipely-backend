import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { INutritionCalculator, NutritionInput, NutritionResult } from '@application/ai/ports/i-nutrition-calculator';
import type { ILogger } from '@application/ports/i-logger';
import { BackfillRecipeNutritionUseCase } from '@application/recipes/use-cases/backfill-recipe-nutrition-use-case';

// ---- fixtures ----------------------------------------------------------------

const ADMIN_ID = 'admin-uuid';
const BATCH_SIZE = 20;

const NUTRITION: NutritionResult = {
  caloriesPerServing: 512,
  protein: 20,
  carbs: 60,
  fat: 18,
  fiber: 4,
};

function makeRecipe(id: string, overrides: Partial<RecipeProps> = {}): Recipe {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = Recipe.create({
    id,
    ownerId: 'owner-1',
    name: { en: `Recipe ${id}` },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta'] },
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

// ---- mocks ------------------------------------------------------------------

interface RecipeRepoOptions {
  batches?: Array<Result<Recipe[], Failure>>;
  updateResults?: Map<string, Result<Recipe, Failure>>;
}

function makeRecipeRepo(options: RecipeRepoOptions = {}): {
  recipeRepo: IRecipeRepository;
  listCalls: () => Array<{ limit: number; excludeIds: readonly string[] }>;
  updateCalls: () => Recipe[];
} {
  const batches = options.batches ?? [ok([])];
  const listCalls: Array<{ limit: number; excludeIds: readonly string[] }> = [];
  const updateCalls: Recipe[] = [];
  let batchIndex = 0;

  const recipeRepo: IRecipeRepository = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    incrementViewCount: jest.fn(),

    async listWithoutNutrition(limit, excludeIds): Promise<Result<Recipe[], Failure>> {
      listCalls.push({ limit, excludeIds: [...(excludeIds ?? [])] });
      const batch = batches[batchIndex] ?? ok([]);
      batchIndex++;
      return batch;
    },

    async update(recipe): Promise<Result<Recipe, Failure>> {
      updateCalls.push(recipe);
      return options.updateResults?.get(recipe.id) ?? ok(recipe);
    },
  };

  return { recipeRepo, listCalls: () => listCalls, updateCalls: () => updateCalls };
}

function makeAuthRepo(roleResult: Result<string | null, Failure> = ok('admin')): IAuthRepository {
  return {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findOrCreateSocialUser: jest.fn(),
    updateAvatar: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
    findRoleById: jest.fn().mockResolvedValue(roleResult),
  };
}

function makeCalculator(
  resultFor: (input: NutritionInput) => Result<NutritionResult, Failure> = () => ok(NUTRITION),
): { calculator: INutritionCalculator; calculateCalls: () => NutritionInput[] } {
  const calculateCalls: NutritionInput[] = [];
  const calculator: INutritionCalculator = {
    async calculate(input): Promise<Result<NutritionResult, Failure>> {
      calculateCalls.push(input);
      return resultFor(input);
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

// ---- tests ------------------------------------------------------------------

describe('BackfillRecipeNutritionUseCase — authorization', () => {
  it('returns ForbiddenFailure when the requester is not an admin', async () => {
    const { recipeRepo, listCalls } = makeRecipeRepo();
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(ok('user')), calculator, logger);

    const result = await useCase.execute({ requesterId: 'regular-user' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
    expect(listCalls()).toHaveLength(0);
  });

  it('returns ForbiddenFailure when the requester has no role (unknown user)', async () => {
    const { recipeRepo } = makeRecipeRepo();
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(ok(null)), calculator, logger);

    const result = await useCase.execute({ requesterId: 'ghost' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
  });

  it('propagates the failure when the role lookup fails', async () => {
    const roleFailure = new UnknownFailure('errors.db.read_failed');
    const { recipeRepo } = makeRecipeRepo();
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(fail(roleFailure)), calculator, logger);

    const result = await useCase.execute({ requesterId: ADMIN_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(roleFailure);
  });
});

describe('BackfillRecipeNutritionUseCase — batching', () => {
  it('returns zero counts when no recipes are missing nutrition', async () => {
    const { recipeRepo } = makeRecipeRepo({ batches: [ok([])] });
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(), calculator, logger);

    const result = await useCase.execute({ requesterId: ADMIN_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ updated: 0, failed: 0 });
  });

  it('updates every recipe in a final short batch', async () => {
    const recipes = [makeRecipe('r1'), makeRecipe('r2')];
    const { recipeRepo, listCalls, updateCalls } = makeRecipeRepo({ batches: [ok(recipes)] });
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(), calculator, logger);

    const result = await useCase.execute({ requesterId: ADMIN_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ updated: 2, failed: 0 });
    expect(updateCalls().map(r => r.id)).toEqual(['r1', 'r2']);
    // A batch smaller than BATCH_SIZE ends the loop without a second query.
    expect(listCalls()).toHaveLength(1);
  });

  it('requests the next batch excluding already-attempted ids after a full batch', async () => {
    const fullBatch = Array.from({ length: BATCH_SIZE }, (_, i) => makeRecipe(`r${i}`));
    const { recipeRepo, listCalls } = makeRecipeRepo({ batches: [ok(fullBatch), ok([])] });
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(), calculator, logger);

    const result = await useCase.execute({ requesterId: ADMIN_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.updated).toBe(BATCH_SIZE);
    expect(listCalls()).toHaveLength(2);
    expect(listCalls()[0]).toEqual({ limit: BATCH_SIZE, excludeIds: [] });
    expect(listCalls()[1]!.excludeIds).toEqual(fullBatch.map(r => r.id));
  });

  it('propagates the failure when a batch query fails', async () => {
    const batchFailure = new UnknownFailure('errors.db.read_failed');
    const { recipeRepo } = makeRecipeRepo({ batches: [fail(batchFailure)] });
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(), calculator, logger);

    const result = await useCase.execute({ requesterId: ADMIN_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(batchFailure);
  });
});

describe('BackfillRecipeNutritionUseCase — per-recipe outcomes', () => {
  it('counts a recipe with no ingredients as failed and does not call the calculator for it', async () => {
    const empty = makeRecipe('r-empty', { ingredients: {} });
    const good = makeRecipe('r-good');
    const { recipeRepo, updateCalls } = makeRecipeRepo({ batches: [ok([empty, good])] });
    const { calculator, calculateCalls } = makeCalculator();
    const { logger, warnCalls } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(), calculator, logger);

    const result = await useCase.execute({ requesterId: ADMIN_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ updated: 1, failed: 1 });
    expect(calculateCalls()).toHaveLength(1);
    expect(updateCalls().map(r => r.id)).toEqual(['r-good']);
    expect(warnCalls()).toContain('backfill_nutrition_skip_no_ingredients');
  });

  it('counts a calculator failure as failed and continues with the rest', async () => {
    const bad = makeRecipe('r-bad', { ingredients: { en: ['mystery'] } });
    const good = makeRecipe('r-good');
    const { recipeRepo } = makeRecipeRepo({ batches: [ok([bad, good])] });
    const { calculator } = makeCalculator(input =>
      input.ingredients[0] === 'mystery' ? fail(new UnknownFailure('errors.ai.nutrition_failed')) : ok(NUTRITION),
    );
    const { logger, warnCalls } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(), calculator, logger);

    const result = await useCase.execute({ requesterId: ADMIN_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ updated: 1, failed: 1 });
    expect(warnCalls()).toContain('backfill_nutrition_calc_failed');
  });

  it('counts a persistence failure as failed and continues with the rest', async () => {
    const first = makeRecipe('r1');
    const second = makeRecipe('r2');
    const updateResults = new Map<string, Result<Recipe, Failure>>([
      ['r1', fail(new UnknownFailure('errors.db.write_failed'))],
    ]);
    const { recipeRepo } = makeRecipeRepo({ batches: [ok([first, second])], updateResults });
    const { calculator } = makeCalculator();
    const { logger, warnCalls } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(), calculator, logger);

    const result = await useCase.execute({ requesterId: ADMIN_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ updated: 1, failed: 1 });
    expect(warnCalls()).toContain('backfill_nutrition_persist_failed');
  });

  it('persists the calculated nutrition on updated recipes', async () => {
    const { recipeRepo, updateCalls } = makeRecipeRepo({ batches: [ok([makeRecipe('r1')])] });
    const { calculator } = makeCalculator();
    const { logger } = makeLogger();
    const useCase = new BackfillRecipeNutritionUseCase(recipeRepo, makeAuthRepo(), calculator, logger);

    await useCase.execute({ requesterId: ADMIN_ID });

    const persisted = updateCalls()[0]!.toRaw();
    expect(persisted.caloriesPerServing).toBe(512);
    expect(persisted.nutrition).toEqual({ protein: 20, carbs: 60, fat: 18, fiber: 4 });
  });
});
