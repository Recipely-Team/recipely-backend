import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IRecipeLikeRepository } from '@domain/likes/i-recipe-like-repository';
import type { RecipePageResult, RecipeQuery, RecipeWithSocial } from '@domain/recipes/recipe-query';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { LikeRecipeUseCase } from '@application/likes/use-cases/like-recipe-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const RECIPE_ID = 'recipe-uuid';

function makeRecipeProps(overrides: Partial<RecipeProps> = {}): RecipeProps {
  return {
    id: RECIPE_ID,
    ownerId: 'owner-uuid',
    name: { en: 'Pasta' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] },
    instructions: { en: ['boil', 'serve'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/pasta.jpg',
    rating: 4,
    tags: { en: ['quick'] },
    mealType: { en: ['dinner'] },
    media: [],
    isPublished: true,
    moderationStatus: 'approved',
    viewCount: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<RecipeProps> = {}): Recipe {
  const result = Recipe.create(makeRecipeProps(overrides));
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

const withSocial = (recipe: Recipe): RecipeWithSocial => ({
  recipe,
  social: { likeCount: 0, likedByMe: false, commentCount: 0 },
});

// ---- repo helpers ------------------------------------------------------------

function makeRecipeRepo(options: {
  found?: RecipeWithSocial | null;
} = {}): {
  repo: IRecipeRepository;
  getByIdCalls: () => Array<{ id: string; currentUserId: string | undefined }>;
} {
  const found = options.found !== undefined ? options.found : withSocial(makeRecipe());
  const getByIdCalls: Array<{ id: string; currentUserId: string | undefined }> = [];

  const repo: IRecipeRepository = {
    list: jest.fn<Promise<Result<RecipePageResult, Failure>>, [RecipeQuery]>(),
    create: jest.fn<Promise<Result<Recipe, Failure>>, [Recipe]>(),
    update: jest.fn<Promise<Result<Recipe, Failure>>, [Recipe]>(),
    delete: jest.fn<Promise<Result<void, Failure>>, [string]>(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),

    async getById(id, currentUserId): Promise<Result<RecipeWithSocial, Failure>> {
      getByIdCalls.push({ id, currentUserId });
      if (found === null) return fail(new NotFoundFailure('errors.recipe.not_found'));
      return ok(found);
    },
  };

  return { repo, getByIdCalls: () => getByIdCalls };
}

function makeLikeRepo(options: {
  addResult?: Result<void, Failure>;
} = {}): {
  likeRepo: IRecipeLikeRepository;
  addCalls: () => Array<{ userId: string; recipeId: string }>;
} {
  const addCalls: Array<{ userId: string; recipeId: string }> = [];
  const addResult: Result<void, Failure> = options.addResult ?? ok(undefined);

  const likeRepo: IRecipeLikeRepository = {
    async add(userId, recipeId): Promise<Result<void, Failure>> {
      addCalls.push({ userId, recipeId });
      return addResult;
    },
    remove: jest.fn<Promise<Result<void, Failure>>, [string, string]>(),
  };

  return { likeRepo, addCalls: () => addCalls };
}

// ---- tests ------------------------------------------------------------------

describe('LikeRecipeUseCase — happy path', () => {
  it('returns ok when the recipe exists and likes.add succeeds', async () => {
    const { repo } = makeRecipeRepo();
    const { likeRepo } = makeLikeRepo();
    const useCase = new LikeRecipeUseCase(likeRepo, repo);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(true);
  });

  it('calls repo.getById once with the recipe id', async () => {
    const { repo, getByIdCalls } = makeRecipeRepo();
    const { likeRepo } = makeLikeRepo();
    const useCase = new LikeRecipeUseCase(likeRepo, repo);

    await useCase.execute(USER_ID, RECIPE_ID);

    expect(getByIdCalls()).toHaveLength(1);
    expect(getByIdCalls()[0]?.id).toBe(RECIPE_ID);
  });

  it('calls repo.getById without a currentUserId argument', async () => {
    const { repo, getByIdCalls } = makeRecipeRepo();
    const { likeRepo } = makeLikeRepo();
    const useCase = new LikeRecipeUseCase(likeRepo, repo);

    await useCase.execute(USER_ID, RECIPE_ID);

    expect(getByIdCalls()[0]?.currentUserId).toBeUndefined();
  });

  it('calls likes.add once with the correct userId and recipeId', async () => {
    const { repo } = makeRecipeRepo();
    const { likeRepo, addCalls } = makeLikeRepo();
    const useCase = new LikeRecipeUseCase(likeRepo, repo);

    await useCase.execute(USER_ID, RECIPE_ID);

    expect(addCalls()).toHaveLength(1);
    expect(addCalls()[0]).toEqual({ userId: USER_ID, recipeId: RECIPE_ID });
  });
});

describe('LikeRecipeUseCase — recipe not found', () => {
  it('returns NotFoundFailure when the recipe does not exist', async () => {
    const { repo } = makeRecipeRepo({ found: null });
    const { likeRepo } = makeLikeRepo();
    const useCase = new LikeRecipeUseCase(likeRepo, repo);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });

  it('does not call likes.add when the recipe is not found', async () => {
    const { repo } = makeRecipeRepo({ found: null });
    const { likeRepo, addCalls } = makeLikeRepo();
    const useCase = new LikeRecipeUseCase(likeRepo, repo);

    await useCase.execute(USER_ID, RECIPE_ID);

    expect(addCalls()).toHaveLength(0);
  });
});

describe('LikeRecipeUseCase — likes.add failure', () => {
  it('propagates the failure when likes.add returns an error', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRecipeRepo();
    const { likeRepo } = makeLikeRepo({ addResult: fail(repoFailure) });
    const useCase = new LikeRecipeUseCase(likeRepo, repo);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
