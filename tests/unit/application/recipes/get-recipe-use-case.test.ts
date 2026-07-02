import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { RecipeWithSocial, RecipeSocialData } from '@domain/recipes/recipe-query';
import { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';

// ---- fixtures ----------------------------------------------------------------

const RECIPE_ID = 'recipe-uuid';
const USER_ID = 'user-uuid';

function makeRecipe(overrides: Partial<RecipeProps> = {}): Recipe {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = Recipe.create({
    id: RECIPE_ID,
    ownerId: 'owner-1',
    name: { en: 'Carbonara', tr: 'Karbonara' },
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

function makeWithSocial(social: Partial<RecipeSocialData> = {}): RecipeWithSocial {
  return {
    recipe: makeRecipe(),
    social: { likeCount: 0, likedByMe: false, commentCount: 0, ...social },
  };
}

// ---- mocks ------------------------------------------------------------------

interface RepoOptions {
  getByIdResult?: Result<RecipeWithSocial, Failure>;
  incrementRejects?: boolean;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IRecipeRepository;
  getByIdCalls: () => Array<{ id: string; currentUserId?: string }>;
  incrementCalls: () => string[];
} {
  const getByIdCalls: Array<{ id: string; currentUserId?: string }> = [];
  const incrementCalls: string[] = [];

  const repo: IRecipeRepository = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),

    async getById(id, currentUserId): Promise<Result<RecipeWithSocial, Failure>> {
      getByIdCalls.push({ id, ...(currentUserId !== undefined ? { currentUserId } : {}) });
      return options.getByIdResult ?? ok(makeWithSocial());
    },

    async incrementViewCount(recipeId): Promise<Result<void, Failure>> {
      incrementCalls.push(recipeId);
      if (options.incrementRejects) throw new Error('db unavailable');
      return ok(undefined);
    },
  };

  return { repo, getByIdCalls: () => getByIdCalls, incrementCalls: () => incrementCalls };
}

// ---- tests ------------------------------------------------------------------

describe('GetRecipeUseCase — happy path', () => {
  it('returns the localized recipe DTO with social data', async () => {
    const { repo } = makeRepo({
      getByIdResult: ok(makeWithSocial({ likeCount: 3, likedByMe: true, commentCount: 1 })),
    });
    const useCase = new GetRecipeUseCase(repo);

    const result = await useCase.execute(RECIPE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(RECIPE_ID);
    expect(result.value.name).toBe('Carbonara');
    expect(result.value.likeCount).toBe(3);
    expect(result.value.likedByMe).toBe(true);
    expect(result.value.commentCount).toBe(1);
  });

  it('localizes the recipe for a non-default locale', async () => {
    const { repo } = makeRepo();
    const useCase = new GetRecipeUseCase(repo);

    const result = await useCase.execute(RECIPE_ID, 'tr');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Karbonara');
  });

  it('forwards currentUserId to the repository when present', async () => {
    const { repo, getByIdCalls } = makeRepo();
    const useCase = new GetRecipeUseCase(repo);

    await useCase.execute(RECIPE_ID, 'en', USER_ID);

    expect(getByIdCalls()).toEqual([{ id: RECIPE_ID, currentUserId: USER_ID }]);
  });

  it('omits currentUserId for anonymous requests', async () => {
    const { repo, getByIdCalls } = makeRepo();
    const useCase = new GetRecipeUseCase(repo);

    await useCase.execute(RECIPE_ID);

    expect(getByIdCalls()).toEqual([{ id: RECIPE_ID }]);
  });

  it('increments the view count without blocking the response', async () => {
    const { repo, incrementCalls } = makeRepo();
    const useCase = new GetRecipeUseCase(repo);

    const result = await useCase.execute(RECIPE_ID);

    expect(result.ok).toBe(true);
    expect(incrementCalls()).toEqual([RECIPE_ID]);
  });

  it('still returns ok when the fire-and-forget view count increment rejects', async () => {
    const { repo } = makeRepo({ incrementRejects: true });
    const useCase = new GetRecipeUseCase(repo);

    const result = await useCase.execute(RECIPE_ID);

    expect(result.ok).toBe(true);
  });
});

describe('GetRecipeUseCase — validation', () => {
  it.each(['', '   '])('fails with ValidationFailure for blank id %p', async (id) => {
    const { repo, getByIdCalls } = makeRepo();
    const useCase = new GetRecipeUseCase(repo);

    const result = await useCase.execute(id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(getByIdCalls()).toHaveLength(0);
  });
});

describe('GetRecipeUseCase — failures', () => {
  it('propagates NotFoundFailure and does not bump the view count', async () => {
    const notFound = new NotFoundFailure('errors.not_found.recipe');
    const { repo, incrementCalls } = makeRepo({ getByIdResult: fail(notFound) });
    const useCase = new GetRecipeUseCase(repo);

    const result = await useCase.execute(RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(incrementCalls()).toHaveLength(0);
  });

  it('propagates unknown repository failures', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo } = makeRepo({ getByIdResult: fail(repoFailure) });
    const useCase = new GetRecipeUseCase(repo);

    const result = await useCase.execute(RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
