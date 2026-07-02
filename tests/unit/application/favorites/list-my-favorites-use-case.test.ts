import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IFavoriteRepository } from '@domain/favorites/i-favorite-repository';
import type { RecipePageResult, RecipeSocialData } from '@domain/recipes/recipe-query';
import {
  ListMyFavoritesUseCase,
  type ListMyFavoritesInput,
} from '@application/favorites/use-cases/list-my-favorites-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';

function makeRecipe(id: string, overrides: Partial<RecipeProps> = {}): Recipe {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = Recipe.create({
    id,
    ownerId: 'owner-1',
    name: { en: `Recipe ${id}`, tr: `Tarif ${id}` },
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

function makePage(
  items: Recipe[],
  social: ReadonlyMap<string, RecipeSocialData> = new Map(),
): RecipePageResult {
  return { items, total: items.length, page: 1, pageSize: 20, socialByRecipeId: social };
}

// ---- mocks ------------------------------------------------------------------

interface RepoOptions {
  listResult?: Result<RecipePageResult, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  favorites: IFavoriteRepository;
  listCalls: () => Array<{ userId: string; page: number; pageSize: number }>;
} {
  const listCalls: Array<{ userId: string; page: number; pageSize: number }> = [];

  const favorites: IFavoriteRepository = {
    add: jest.fn(),
    remove: jest.fn(),

    async listForUser(userId, page, pageSize): Promise<Result<RecipePageResult, Failure>> {
      listCalls.push({ userId, page, pageSize });
      return options.listResult ?? ok(makePage([makeRecipe('r1')]));
    },
  };

  return { favorites, listCalls: () => listCalls };
}

function makeInput(overrides: Partial<ListMyFavoritesInput> = {}): ListMyFavoritesInput {
  return { userId: USER_ID, ...overrides };
}

// ---- tests ------------------------------------------------------------------

describe('ListMyFavoritesUseCase — happy path', () => {
  it('returns the favorited recipes as DTOs', async () => {
    const { favorites } = makeRepo({ listResult: ok(makePage([makeRecipe('r1'), makeRecipe('r2')])) });
    const useCase = new ListMyFavoritesUseCase(favorites);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.map(i => i.id)).toEqual(['r1', 'r2']);
    expect(result.value.total).toBe(2);
  });

  it('enriches items with social data from the page result', async () => {
    const social = new Map<string, RecipeSocialData>([
      ['r1', { likeCount: 7, likedByMe: true, commentCount: 2 }],
    ]);
    const { favorites } = makeRepo({ listResult: ok(makePage([makeRecipe('r1')], social)) });
    const useCase = new ListMyFavoritesUseCase(favorites);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]!.likeCount).toBe(7);
    expect(result.value.items[0]!.likedByMe).toBe(true);
    expect(result.value.items[0]!.commentCount).toBe(2);
  });

  it('localizes recipes using the provided locale', async () => {
    const { favorites } = makeRepo({ listResult: ok(makePage([makeRecipe('r1')])) });
    const useCase = new ListMyFavoritesUseCase(favorites);

    const result = await useCase.execute(makeInput({ locale: 'tr' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]!.name).toBe('Tarif r1');
  });

  it('returns an empty page when the user has no favorites', async () => {
    const { favorites } = makeRepo({ listResult: ok(makePage([])) });
    const useCase = new ListMyFavoritesUseCase(favorites);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual([]);
    expect(result.value.total).toBe(0);
  });
});

describe('ListMyFavoritesUseCase — pagination defaults and validation', () => {
  it('defaults to page 1 and pageSize 20', async () => {
    const { favorites, listCalls } = makeRepo();
    const useCase = new ListMyFavoritesUseCase(favorites);

    await useCase.execute(makeInput());

    expect(listCalls()).toEqual([{ userId: USER_ID, page: 1, pageSize: 20 }]);
  });

  it('forwards explicit page and pageSize', async () => {
    const { favorites, listCalls } = makeRepo();
    const useCase = new ListMyFavoritesUseCase(favorites);

    await useCase.execute(makeInput({ page: 3, pageSize: 50 }));

    expect(listCalls()).toEqual([{ userId: USER_ID, page: 3, pageSize: 50 }]);
  });

  it('accepts the maximum pageSize of 100', async () => {
    const { favorites } = makeRepo();
    const useCase = new ListMyFavoritesUseCase(favorites);

    const result = await useCase.execute(makeInput({ pageSize: 100 }));

    expect(result.ok).toBe(true);
  });

  it.each([0, -1, 1.5])('fails with ValidationFailure for page %p', async (page) => {
    const { favorites, listCalls } = makeRepo();
    const useCase = new ListMyFavoritesUseCase(favorites);

    const result = await useCase.execute(makeInput({ page }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.page_invalid');
    expect(listCalls()).toHaveLength(0);
  });

  it.each([0, -5, 101, 2.5])('fails with ValidationFailure for pageSize %p', async (pageSize) => {
    const { favorites, listCalls } = makeRepo();
    const useCase = new ListMyFavoritesUseCase(favorites);

    const result = await useCase.execute(makeInput({ pageSize }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.page_size_invalid');
    expect(listCalls()).toHaveLength(0);
  });
});

describe('ListMyFavoritesUseCase — repository failure', () => {
  it('propagates the failure when listForUser fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { favorites } = makeRepo({ listResult: fail(repoFailure) });
    const useCase = new ListMyFavoritesUseCase(favorites);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
