import { ok, fail, type Result } from '@core/result/result';
import { ValidationFailure, UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository, UserPreferences } from '@domain/recipes/i-recipe-repository';
import type {
  RecipePageResult,
  RecipeQuery,
  RecipeWithSocial,
  RecipeSocialData,
} from '@domain/recipes/recipe-query';
import { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';

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
  };
}

function makeRecipe(id: string, overrides: Partial<RecipeProps> = {}): Recipe {
  const result = Recipe.create(makeRecipeProps(id, overrides));
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

const emptySocial: ReadonlyMap<string, RecipeSocialData> = new Map();

function makePageResult(items: Recipe[]): RecipePageResult {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    socialByRecipeId: emptySocial,
  };
}

// ---- repo helpers -----------------------------------------------------------

interface RepoOptions {
  pageResult?: RecipePageResult;
  preferences?: UserPreferences;
  preferencesFailure?: Failure;
  captureQuery?: (q: RecipeQuery) => void;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IRecipeRepository;
  listCalls: () => RecipeQuery[];
  preferencesCalls: () => string[];
} {
  const listCalls: RecipeQuery[] = [];
  const preferencesCalls: string[] = [];

  const repo: IRecipeRepository = {
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),

    async list(query: RecipeQuery): Promise<Result<RecipePageResult, Failure>> {
      listCalls.push(query);
      if (options.captureQuery) options.captureQuery(query);
      const pageResult = options.pageResult ?? makePageResult([]);
      return ok(pageResult);
    },

    async getPreferencesForUser(userId: string): Promise<Result<UserPreferences, Failure>> {
      preferencesCalls.push(userId);
      if (options.preferencesFailure) return fail(options.preferencesFailure);
      const prefs = options.preferences ?? { categories: [], cuisines: [] };
      return ok(prefs);
    },
  };

  return {
    repo,
    listCalls: () => listCalls,
    preferencesCalls: () => preferencesCalls,
  };
}

// ---- tests: likedOnly without auth ------------------------------------------

describe('ListRecipesUseCase — likedOnly without currentUserId', () => {
  it('returns ValidationFailure when likedOnly is true and currentUserId is undefined', async () => {
    const { repo } = makeRepo();
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ likedOnly: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });

  it('returns the auth_required_for_liked_only message key', async () => {
    const { repo } = makeRepo();
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ likedOnly: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.auth_required_for_liked_only');
  });

  it('does not call repo.list when likedOnly guard triggers', async () => {
    const { repo, listCalls } = makeRepo();
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ likedOnly: true });

    expect(listCalls()).toHaveLength(0);
  });
});

// ---- tests: personalization -------------------------------------------------

describe('ListRecipesUseCase — personalize with preferences', () => {
  it('calls getPreferencesForUser with the currentUserId', async () => {
    const recipe1 = makeRecipe('r1', { cuisine: 'ITALIAN', category: 'MAIN_COURSE' });
    const { repo, preferencesCalls } = makeRepo({
      pageResult: makePageResult([recipe1]),
      preferences: { categories: ['DINNER'], cuisines: ['ITALIAN'] },
    });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ personalize: true, currentUserId: 'user-1' });

    expect(preferencesCalls()).toHaveLength(1);
    expect(preferencesCalls()[0]).toBe('user-1');
  });

  it('returns items matching preferred cuisine before non-matching items', async () => {
    // r1 matches preferred cuisine ITALIAN, r2 does not
    const r1 = makeRecipe('r1', { cuisine: 'ITALIAN' });
    const r2 = makeRecipe('r2', { cuisine: 'MEXICAN' });
    const r3 = makeRecipe('r3', { cuisine: 'ITALIAN' });
    const { repo } = makeRepo({
      pageResult: makePageResult([r2, r1, r3]),
      preferences: { categories: [], cuisines: ['ITALIAN'] },
    });
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ personalize: true, currentUserId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.items.map(i => i.id);
    // r1 and r3 (ITALIAN) should appear before r2 (MEXICAN)
    expect(ids.indexOf('r1')).toBeLessThan(ids.indexOf('r2'));
    expect(ids.indexOf('r3')).toBeLessThan(ids.indexOf('r2'));
  });

  it('returns items matching preferred category before non-matching items', async () => {
    const r1 = makeRecipe('r1', { category: 'DINNER' });
    const r2 = makeRecipe('r2', { category: 'BREAKFAST' });
    const { repo } = makeRepo({
      pageResult: makePageResult([r2, r1]),
      preferences: { categories: ['DINNER'], cuisines: [] },
    });
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ personalize: true, currentUserId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.items.map(i => i.id);
    expect(ids.indexOf('r1')).toBeLessThan(ids.indexOf('r2'));
  });

  it('preserves original DB order within the preferred group (stable sort)', async () => {
    const r1 = makeRecipe('r1', { cuisine: 'ITALIAN' });
    const r2 = makeRecipe('r2', { cuisine: 'ITALIAN' });
    const r3 = makeRecipe('r3', { cuisine: 'ITALIAN' });
    const { repo } = makeRepo({
      pageResult: makePageResult([r3, r1, r2]),
      preferences: { categories: [], cuisines: ['ITALIAN'] },
    });
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ personalize: true, currentUserId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.items.map(i => i.id);
    // All are preferred, original DB order r3, r1, r2 must be preserved
    expect(ids).toEqual(['r3', 'r1', 'r2']);
  });

  it('preserves original DB order within the non-preferred group (stable sort)', async () => {
    const preferred = makeRecipe('p1', { cuisine: 'ITALIAN' });
    const r1 = makeRecipe('r1', { cuisine: 'MEXICAN' });
    const r2 = makeRecipe('r2', { cuisine: 'CHINESE' });
    const r3 = makeRecipe('r3', { cuisine: 'THAI' });
    const { repo } = makeRepo({
      pageResult: makePageResult([r3, preferred, r1, r2]),
      preferences: { categories: [], cuisines: ['ITALIAN'] },
    });
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ personalize: true, currentUserId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.items.map(i => i.id);
    // p1 (preferred) goes first; r3, r1, r2 (non-preferred) keep their DB order
    expect(ids[0]).toBe('p1');
    expect(ids.slice(1)).toEqual(['r3', 'r1', 'r2']);
  });
});

describe('ListRecipesUseCase — personalize with empty preferences', () => {
  it('returns items in original DB order when preferences are empty', async () => {
    const r1 = makeRecipe('r1');
    const r2 = makeRecipe('r2');
    const { repo } = makeRepo({
      pageResult: makePageResult([r1, r2]),
      preferences: { categories: [], cuisines: [] },
    });
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ personalize: true, currentUserId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.items.map(i => i.id);
    expect(ids).toEqual(['r1', 'r2']);
  });
});

describe('ListRecipesUseCase — personalize without currentUserId', () => {
  it('does not call getPreferencesForUser when currentUserId is absent', async () => {
    const { repo, preferencesCalls } = makeRepo({
      pageResult: makePageResult([makeRecipe('r1')]),
      preferences: { categories: ['DINNER'], cuisines: ['ITALIAN'] },
    });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ personalize: true });

    expect(preferencesCalls()).toHaveLength(0);
  });

  it('returns items in original DB order when personalize=true but no currentUserId', async () => {
    const r1 = makeRecipe('r1', { cuisine: 'ITALIAN' });
    const r2 = makeRecipe('r2', { cuisine: 'MEXICAN' });
    const { repo } = makeRepo({ pageResult: makePageResult([r1, r2]) });
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ personalize: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.items.map(i => i.id);
    expect(ids).toEqual(['r1', 'r2']);
  });
});

describe('ListRecipesUseCase — personalize with preferences fetch failure', () => {
  it('returns items in original DB order when preferences fetch fails', async () => {
    const r1 = makeRecipe('r1', { cuisine: 'ITALIAN' });
    const r2 = makeRecipe('r2', { cuisine: 'MEXICAN' });
    const { repo } = makeRepo({
      pageResult: makePageResult([r1, r2]),
      preferencesFailure: new UnknownFailure('errors.db.read_failed'),
    });
    const useCase = new ListRecipesUseCase(repo);

    const result = await useCase.execute({ personalize: true, currentUserId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.items.map(i => i.id);
    expect(ids).toEqual(['r1', 'r2']);
  });
});

// ---- tests: exactOptionalPropertyTypes (conditional spread) -----------------

describe('ListRecipesUseCase — query forwarding (exactOptionalPropertyTypes)', () => {
  it('does not include categories key when categories input is absent', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({});

    expect(capturedQuery).toBeDefined();
    expect(capturedQuery).not.toHaveProperty('categories');
  });

  it('does not include cuisines key when cuisines input is absent', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({});

    expect(capturedQuery).toBeDefined();
    expect(capturedQuery).not.toHaveProperty('cuisines');
  });

  it('does not include likedOnly key when likedOnly is not true', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ currentUserId: 'user-1' });

    expect(capturedQuery).toBeDefined();
    expect(capturedQuery).not.toHaveProperty('likedOnly');
  });

  it('does not include sortOrder key when sortOrder is absent', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({});

    expect(capturedQuery).toBeDefined();
    expect(capturedQuery).not.toHaveProperty('sortOrder');
  });

  it('forwards categories verbatim when present', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ categories: ['DINNER', 'DESSERT'] });

    expect(capturedQuery).toHaveProperty('categories', ['DINNER', 'DESSERT']);
  });

  it('forwards cuisines verbatim when present', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ cuisines: ['TURKISH', 'ITALIAN'] });

    expect(capturedQuery).toHaveProperty('cuisines', ['TURKISH', 'ITALIAN']);
  });

  it('forwards sort mostLiked when present', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ sort: 'mostLiked' });

    expect(capturedQuery).toHaveProperty('sort', 'mostLiked');
  });

  it('forwards sortOrder asc when present', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ sortOrder: 'asc' });

    expect(capturedQuery).toHaveProperty('sortOrder', 'asc');
  });

  it('includes likedOnly: true in the query when requested with a user', async () => {
    let capturedQuery: RecipeQuery | undefined;
    const { repo } = makeRepo({ captureQuery: q => { capturedQuery = q; } });
    const useCase = new ListRecipesUseCase(repo);

    await useCase.execute({ likedOnly: true, currentUserId: 'user-1' });

    expect(capturedQuery).toHaveProperty('likedOnly', true);
  });
});
