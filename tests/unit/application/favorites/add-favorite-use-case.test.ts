import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { RecipeWithSocial } from '@domain/recipes/recipe-query';
import type { IFavoriteRepository } from '@domain/favorites/i-favorite-repository';
import { AddFavoriteUseCase } from '@application/favorites/use-cases/add-favorite-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const RECIPE_ID = 'recipe-uuid';

function makeRecipe(): Recipe {
  const now = new Date('2026-01-01T00:00:00Z');
  const props: RecipeProps = {
    id: RECIPE_ID,
    ownerId: 'owner-1',
    name: { en: 'Carbonara' },
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
  };
  const result = Recipe.create(props);
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

function makeRecipeWithSocial(): RecipeWithSocial {
  return {
    recipe: makeRecipe(),
    social: { likeCount: 0, likedByMe: false, commentCount: 0 },
  };
}

// ---- mocks ------------------------------------------------------------------

interface RecipeRepoOptions {
  getByIdResult?: Result<RecipeWithSocial, Failure>;
}

function makeRecipeRepo(options: RecipeRepoOptions = {}): {
  recipeRepo: IRecipeRepository;
  getByIdCalls: () => string[];
} {
  const getByIdCalls: string[] = [];

  const recipeRepo: IRecipeRepository = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),

    async getById(id): Promise<Result<RecipeWithSocial, Failure>> {
      getByIdCalls.push(id);
      return options.getByIdResult ?? ok(makeRecipeWithSocial());
    },
  };

  return { recipeRepo, getByIdCalls: () => getByIdCalls };
}

interface FavoriteRepoOptions {
  addResult?: Result<void, Failure>;
}

function makeFavoriteRepo(options: FavoriteRepoOptions = {}): {
  favorites: IFavoriteRepository;
  addCalls: () => Array<{ userId: string; recipeId: string }>;
} {
  const addCalls: Array<{ userId: string; recipeId: string }> = [];

  const favorites: IFavoriteRepository = {
    remove: jest.fn(),
    listForUser: jest.fn(),

    async add(userId, recipeId): Promise<Result<void, Failure>> {
      addCalls.push({ userId, recipeId });
      return options.addResult ?? ok(undefined);
    },
  };

  return { favorites, addCalls: () => addCalls };
}

// ---- tests ------------------------------------------------------------------

describe('AddFavoriteUseCase — happy path', () => {
  it('returns ok when the recipe exists and add succeeds', async () => {
    const { recipeRepo } = makeRecipeRepo();
    const { favorites } = makeFavoriteRepo();
    const useCase = new AddFavoriteUseCase(favorites, recipeRepo);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(true);
  });

  it('verifies the recipe exists before adding the favorite', async () => {
    const { recipeRepo, getByIdCalls } = makeRecipeRepo();
    const { favorites, addCalls } = makeFavoriteRepo();
    const useCase = new AddFavoriteUseCase(favorites, recipeRepo);

    await useCase.execute(USER_ID, RECIPE_ID);

    expect(getByIdCalls()).toEqual([RECIPE_ID]);
    expect(addCalls()).toEqual([{ userId: USER_ID, recipeId: RECIPE_ID }]);
  });

  it('remains ok when the favorite already exists (idempotent add)', async () => {
    const { recipeRepo } = makeRecipeRepo();
    const { favorites } = makeFavoriteRepo({ addResult: ok(undefined) });
    const useCase = new AddFavoriteUseCase(favorites, recipeRepo);

    const first = await useCase.execute(USER_ID, RECIPE_ID);
    const second = await useCase.execute(USER_ID, RECIPE_ID);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });
});

describe('AddFavoriteUseCase — recipe not found', () => {
  it('returns NotFoundFailure and does not add when the recipe does not exist', async () => {
    const notFound = new NotFoundFailure('errors.not_found.recipe');
    const { recipeRepo } = makeRecipeRepo({ getByIdResult: fail(notFound) });
    const { favorites, addCalls } = makeFavoriteRepo();
    const useCase = new AddFavoriteUseCase(favorites, recipeRepo);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(addCalls()).toHaveLength(0);
  });
});

describe('AddFavoriteUseCase — repository failure', () => {
  it('propagates the failure when favorites.add fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { recipeRepo } = makeRecipeRepo();
    const { favorites } = makeFavoriteRepo({ addResult: fail(repoFailure) });
    const useCase = new AddFavoriteUseCase(favorites, recipeRepo);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
