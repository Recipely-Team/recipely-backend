import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { RecipeLikeRepositoryInterface } from '@domain/likes/recipe-like-repository-interface';
import type { RecipePageResult, RecipeSocialData } from '@domain/recipes/recipe-query';
import {
  ListMyLikedRecipesUseCase,
  type ListMyLikedRecipesInput,
} from '@application/likes/use-cases/list-my-liked-recipes-use-case';

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
  likes: RecipeLikeRepositoryInterface;
  listCalls: () => Array<{ userId: string; page: number; pageSize: number }>;
} {
  const listCalls: Array<{ userId: string; page: number; pageSize: number }> = [];

  const likes: RecipeLikeRepositoryInterface = {
    add: jest.fn(),
    remove: jest.fn(),

    async listForUser(userId, page, pageSize): Promise<Result<RecipePageResult, Failure>> {
      listCalls.push({ userId, page, pageSize });
      return options.listResult ?? ok(makePage([makeRecipe('r1')]));
    },
  };

  return { likes, listCalls: () => listCalls };
}

function makeInput(overrides: Partial<ListMyLikedRecipesInput> = {}): ListMyLikedRecipesInput {
  return { userId: USER_ID, ...overrides };
}

// ---- tests ------------------------------------------------------------------

describe('ListMyLikedRecipesUseCase — happy path', () => {
  it('returns the liked recipes as DTOs', async () => {
    const { likes } = makeRepo({ listResult: ok(makePage([makeRecipe('r1'), makeRecipe('r2')])) });
    const useCase = new ListMyLikedRecipesUseCase(likes);

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
    const { likes } = makeRepo({ listResult: ok(makePage([makeRecipe('r1')], social)) });
    const useCase = new ListMyLikedRecipesUseCase(likes);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]!.likeCount).toBe(7);
    expect(result.value.items[0]!.likedByMe).toBe(true);
    expect(result.value.items[0]!.commentCount).toBe(2);
  });

  it('localizes recipes using the provided locale', async () => {
    const { likes } = makeRepo({ listResult: ok(makePage([makeRecipe('r1')])) });
    const useCase = new ListMyLikedRecipesUseCase(likes);

    const result = await useCase.execute(makeInput({ locale: 'tr' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]!.name).toBe('Tarif r1');
  });

  it('returns an empty page when the user has liked nothing', async () => {
    const { likes } = makeRepo({ listResult: ok(makePage([])) });
    const useCase = new ListMyLikedRecipesUseCase(likes);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual([]);
    expect(result.value.total).toBe(0);
  });
});

describe('ListMyLikedRecipesUseCase — pagination defaults and validation', () => {
  it('defaults to page 1 and pageSize 20', async () => {
    const { likes, listCalls } = makeRepo();
    const useCase = new ListMyLikedRecipesUseCase(likes);

    await useCase.execute(makeInput());

    expect(listCalls()).toEqual([{ userId: USER_ID, page: 1, pageSize: 20 }]);
  });

  // The bug this guards: a repository that writes its page number inline serves
  // page one forever, and no type ever objects (CLAUDE.md rule 23d).
  it('forwards explicit page and pageSize', async () => {
    const { likes, listCalls } = makeRepo();
    const useCase = new ListMyLikedRecipesUseCase(likes);

    await useCase.execute(makeInput({ page: 3, pageSize: 50 }));

    expect(listCalls()).toEqual([{ userId: USER_ID, page: 3, pageSize: 50 }]);
  });

  it('accepts the maximum pageSize of 100', async () => {
    const { likes } = makeRepo();
    const useCase = new ListMyLikedRecipesUseCase(likes);

    const result = await useCase.execute(makeInput({ pageSize: 100 }));

    expect(result.ok).toBe(true);
  });

  it.each([0, -1, 1.5])('fails with ValidationFailure for page %p', async (page) => {
    const { likes, listCalls } = makeRepo();
    const useCase = new ListMyLikedRecipesUseCase(likes);

    const result = await useCase.execute(makeInput({ page }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.page_invalid');
    expect(listCalls()).toHaveLength(0);
  });

  it.each([0, -5, 101, 2.5])('fails with ValidationFailure for pageSize %p', async (pageSize) => {
    const { likes, listCalls } = makeRepo();
    const useCase = new ListMyLikedRecipesUseCase(likes);

    const result = await useCase.execute(makeInput({ pageSize }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.page_size_invalid');
    expect(listCalls()).toHaveLength(0);
  });
});

describe('ListMyLikedRecipesUseCase — repository failure', () => {
  it('propagates the failure when listForUser fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { likes } = makeRepo({ listResult: fail(repoFailure) });
    const useCase = new ListMyLikedRecipesUseCase(likes);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
