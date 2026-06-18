import { ok, fail, type Result } from '@core/result/result';
import { ValidationFailure, UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository, UserPreferences } from '@domain/recipes/i-recipe-repository';
import type {
  RecipePageResult,
  RecipeQuery,
  RecipeSocialData,
  RecipeWithSocial,
} from '@domain/recipes/recipe-query';
import {
  ListTrendingRecipesUseCase,
  type ListTrendingRecipesInput,
} from '@application/recipes/use-cases/list-trending-recipes-use-case';

// ---- fixtures ---------------------------------------------------------------

function makeRecipeProps(id: string, overrides: Partial<RecipeProps> = {}): RecipeProps {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id,
    ownerId: 'owner-1',
    name: { en: `Recipe ${id}` },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta'] },
    instructions: { en: ['boil water'] },
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
    viewCount: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRecipe(id: string, overrides: Partial<RecipeProps> = {}): Recipe {
  const result = Recipe.create(makeRecipeProps(id, overrides));
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

const emptySocial: ReadonlyMap<string, RecipeSocialData> = new Map();

function makePageResult(items: Recipe[], pageSize = 10): RecipePageResult {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize,
    socialByRecipeId: emptySocial,
  };
}

// ---- minimal mock repo -------------------------------------------------------

interface RepoOptions {
  pageResult?: RecipePageResult;
  listFailure?: Failure;
  captureQuery?: (q: RecipeQuery) => void;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IRecipeRepository;
  listCalls: () => RecipeQuery[];
} {
  const listCalls: RecipeQuery[] = [];

  const repo: IRecipeRepository = {
    getById: jest.fn<Promise<Result<RecipeWithSocial, Failure>>, [string, string?]>(),
    create: jest.fn<Promise<Result<Recipe, Failure>>, [Recipe]>(),
    update: jest.fn<Promise<Result<Recipe, Failure>>, [Recipe]>(),
    delete: jest.fn<Promise<Result<void, Failure>>, [string]>(),
    listWithoutNutrition: jest.fn<Promise<Result<Recipe[], Failure>>, [number, (readonly string[])?]>(),
    incrementViewCount: jest.fn<Promise<Result<void, Failure>>, [string]>(),
    getPreferencesForUser: jest.fn<Promise<Result<UserPreferences, Failure>>, [string, (number | undefined)?]>(),

    async list(query: RecipeQuery): Promise<Result<RecipePageResult, Failure>> {
      listCalls.push(query);
      if (options.captureQuery) options.captureQuery(query);
      if (options.listFailure) return fail(options.listFailure);
      return ok(options.pageResult ?? makePageResult([]));
    },
  };

  return {
    repo,
    listCalls: () => listCalls,
  };
}

// ---- tests: success ----------------------------------------------------------

describe('ListTrendingRecipesUseCase — success path', () => {
  it('returns ok with a paged DTO when the repository succeeds', async () => {
    const recipe = makeRecipe('r1', { viewCount: 200 });
    const { repo } = makeRepo({ pageResult: makePageResult([recipe], 10) });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 10 });

    expect(result.ok).toBe(true);
  });

  it('returns items from the repository inside the paged DTO', async () => {
    const r1 = makeRecipe('r1', { viewCount: 200 });
    const r2 = makeRecipe('r2', { viewCount: 150 });
    const { repo } = makeRepo({ pageResult: makePageResult([r1, r2], 10) });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items[0]?.id).toBe('r1');
    expect(result.value.items[1]?.id).toBe('r2');
  });

  it('calls repo.list with sort: trending', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListTrendingRecipesUseCase(repo);

    await useCase.execute({ limit: 5 });

    expect(capturedQuery).toBeDefined();
    expect(capturedQuery?.sort).toBe('trending');
  });

  it('calls repo.list with page: 1', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListTrendingRecipesUseCase(repo);

    await useCase.execute({ limit: 5 });

    expect(capturedQuery?.page).toBe(1);
  });

  it('calls repo.list with pageSize equal to the provided limit', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListTrendingRecipesUseCase(repo);

    await useCase.execute({ limit: 15 });

    expect(capturedQuery?.pageSize).toBe(15);
  });

  it('returns paged DTO with total, page, and pageSize from the repo', async () => {
    const { repo } = makeRepo({ pageResult: makePageResult([makeRecipe('r1')], 10) });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe(1);
    expect(result.value.page).toBe(1);
    expect(result.value.pageSize).toBe(10);
  });
});

// ---- tests: default limit ---------------------------------------------------

describe('ListTrendingRecipesUseCase — default limit', () => {
  it('calls repo.list with pageSize: 10 when limit is omitted', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListTrendingRecipesUseCase(repo);

    await useCase.execute({});

    expect(capturedQuery?.pageSize).toBe(10);
  });

  it('returns ok when called with no arguments at all', async () => {
    const { repo } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({});

    expect(result.ok).toBe(true);
  });
});

// ---- tests: limit validation -------------------------------------------------

describe('ListTrendingRecipesUseCase — limit validation', () => {
  it('returns ValidationFailure when limit is 0', async () => {
    const { repo } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });

  it('returns ValidationFailure when limit is negative', async () => {
    const { repo } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: -5 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });

  it('returns ValidationFailure when limit is a non-integer (float)', async () => {
    const { repo } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 2.5 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });

  it('returns ValidationFailure when limit exceeds 30', async () => {
    const { repo } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 31 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });

  it('carries the page_size_invalid message key when limit is invalid', async () => {
    const { repo } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.page_size_invalid');
  });

  it('does not call repo.list when the limit is invalid', async () => {
    const { repo, listCalls } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    await useCase.execute({ limit: 0 });

    expect(listCalls()).toHaveLength(0);
  });

  it('succeeds with limit at the boundary of 1', async () => {
    const { repo } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 1 });

    expect(result.ok).toBe(true);
  });

  it('succeeds with limit at the boundary of 30', async () => {
    const { repo } = makeRepo();
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 30 });

    expect(result.ok).toBe(true);
  });
});

// ---- tests: currentUserId passthrough ----------------------------------------

describe('ListTrendingRecipesUseCase — currentUserId passthrough', () => {
  it('includes currentUserId in the repo query when provided', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListTrendingRecipesUseCase(repo);

    await useCase.execute({ currentUserId: 'user-123' });

    expect(capturedQuery).toHaveProperty('currentUserId', 'user-123');
  });

  it('does not include currentUserId key in the repo query when omitted', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListTrendingRecipesUseCase(repo);

    // No currentUserId provided — exactOptionalPropertyTypes requires the key
    // to be absent, not set to undefined.
    const input: ListTrendingRecipesInput = {};
    await useCase.execute(input);

    expect(capturedQuery).not.toHaveProperty('currentUserId');
  });
});

// ---- tests: locale -----------------------------------------------------------

describe('ListTrendingRecipesUseCase — locale', () => {
  it('defaults to locale en when locale is omitted', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListTrendingRecipesUseCase(repo);

    await useCase.execute({});

    expect(capturedQuery?.locale).toBe('en');
  });

  it('passes the provided locale through to the repo query', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListTrendingRecipesUseCase(repo);

    await useCase.execute({ locale: 'tr' });

    expect(capturedQuery?.locale).toBe('tr');
  });

  it('localizes item names using the provided locale', async () => {
    const recipe = makeRecipe('r1', { name: { en: 'Pasta', tr: 'Makarna' } });
    const { repo } = makeRepo({ pageResult: makePageResult([recipe], 10) });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ locale: 'tr' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.name).toBe('Makarna');
  });

  it('falls back to en locale in the localized item name when locale is omitted', async () => {
    const recipe = makeRecipe('r1', { name: { en: 'Pasta', tr: 'Makarna' } });
    const { repo } = makeRepo({ pageResult: makePageResult([recipe], 10) });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.name).toBe('Pasta');
  });
});

// ---- tests: repository failure propagation -----------------------------------

describe('ListTrendingRecipesUseCase — repository failure propagation', () => {
  it('returns the failure when repo.list returns a failure Result', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo } = makeRepo({ listFailure: repoFailure });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 10 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });

  it('propagates the exact failure code from a repo UnknownFailure', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo } = makeRepo({ listFailure: repoFailure });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 10 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
  });

  it('does not wrap or transform a repo failure', async () => {
    const repoFailure = new ValidationFailure('errors.validation.something', 'field');
    const { repo } = makeRepo({ listFailure: repoFailure });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 5 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Must be the exact same reference, not a wrapped copy
    expect(result.failure).toBe(repoFailure);
  });
});

// ---- tests: social data via RecipeMapper ------------------------------------

describe('ListTrendingRecipesUseCase — social data mapping', () => {
  it('includes likeCount from socialByRecipeId in the returned DTO', async () => {
    const recipe = makeRecipe('r1');
    const social: RecipeSocialData = { likeCount: 42, likedByMe: true, commentCount: 5 };
    const pageResult: RecipePageResult = {
      items: [recipe],
      total: 1,
      page: 1,
      pageSize: 10,
      socialByRecipeId: new Map([['r1', social]]),
    };
    const { repo } = makeRepo({ pageResult });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.likeCount).toBe(42);
    expect(result.value.items[0]?.likedByMe).toBe(true);
    expect(result.value.items[0]?.commentCount).toBe(5);
  });

  it('defaults likeCount to 0 when no social data is present for a recipe', async () => {
    const recipe = makeRecipe('r1');
    const { repo } = makeRepo({ pageResult: makePageResult([recipe], 10) });
    const useCase = new ListTrendingRecipesUseCase(repo);

    const result = await useCase.execute({ limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.likeCount).toBe(0);
    expect(result.value.items[0]?.likedByMe).toBe(false);
  });
});
