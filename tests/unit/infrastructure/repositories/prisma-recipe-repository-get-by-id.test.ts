import type { PrismaClient } from '@prisma/client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';
import type { RecipeRowWithMedia } from '@infrastructure/prisma/mappers/recipe.row-mapper';

// getById's guest/owner visibility guarantee is enforced entirely by the
// Prisma `where` clause sent to Postgres — the repository does no extra
// filtering in JS after the row comes back. These tests therefore assert
// two things for each scenario: (1) the `where` clause built for the given
// (id, currentUserId) pair has the right shape to make Postgres apply that
// guarantee, and (2) the repository maps whatever `findFirst` resolves
// (row vs. null) to the right Result. There is no disposable Postgres
// available in this environment, so real-DB round-trip coverage of this
// query is not exercised here — see hand-off notes.

const RECIPE_ID = 'recipe-1';
const OWNER_ID = 'owner-1';
const OTHER_USER_ID = 'other-user-1';

function baseRow(overrides: Partial<RecipeRowWithMedia> = {}): RecipeRowWithMedia {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: RECIPE_ID,
    name: { en: 'Pasta' } as unknown as RecipeRowWithMedia['name'],
    cuisine: 'ITALIAN' as RecipeRowWithMedia['cuisine'],
    category: 'MAIN_COURSE' as RecipeRowWithMedia['category'],
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] } as unknown as RecipeRowWithMedia['ingredients'],
    instructions: { en: ['boil', 'serve'] } as unknown as RecipeRowWithMedia['instructions'],
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/pasta.jpg',
    rating: 4.5,
    tags: { en: ['quick'] } as unknown as RecipeRowWithMedia['tags'],
    mealType: { en: ['dinner'] } as unknown as RecipeRowWithMedia['mealType'],
    ownerId: OWNER_ID,
    isPublished: true,
    moderationStatus: 'approved',
    viewCount: 0,
    totalTimeMinutes: 30,
    nutrition: null,
    tips: null,
    sourceUrl: null,
    commentCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    media: [],
    ...overrides,
  } as RecipeRowWithMedia;
}

function rowWithCount(overrides: Partial<RecipeRowWithMedia> = {}): unknown {
  return { ...baseRow(overrides), _count: { likes: 0 } };
}

function makePrisma(findFirst: jest.Mock): PrismaClient {
  return { recipe: { findFirst } } as unknown as PrismaClient;
}

// ---- (a)/(b): guest (no currentUserId) ---------------------------------------

describe('PrismaRecipeRepository.getById — guest (no currentUserId)', () => {
  it('sends a where clause whose only OR branch is isPublished: true', async () => {
    const findFirst = jest.fn().mockResolvedValue(rowWithCount());
    const repo = new PrismaRecipeRepository(makePrisma(findFirst));

    await repo.getById(RECIPE_ID);

    const where = findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ isPublished: true }]);
  });

  it('returns ok when findFirst resolves a published row', async () => {
    const findFirst = jest.fn().mockResolvedValue(rowWithCount({ isPublished: true }));
    const repo = new PrismaRecipeRepository(makePrisma(findFirst));

    const result = await repo.getById(RECIPE_ID);

    expect(result.ok).toBe(true);
  });

  it('returns NotFoundFailure when findFirst resolves null for an unpublished recipe', async () => {
    // Simulates Postgres excluding the row because isPublished is false and
    // there is no ownerId branch in the OR (guest request).
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new PrismaRecipeRepository(makePrisma(findFirst));

    const result = await repo.getById(RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

// ---- (c): owner fetching their own unpublished recipe ------------------------

describe('PrismaRecipeRepository.getById — owner (currentUserId === ownerId)', () => {
  it('sends a where clause whose OR includes ownerId: currentUserId alongside isPublished: true', async () => {
    const findFirst = jest.fn().mockResolvedValue(rowWithCount({ isPublished: false, ownerId: OWNER_ID }));
    const repo = new PrismaRecipeRepository(makePrisma(findFirst));

    await repo.getById(RECIPE_ID, OWNER_ID);

    const where = findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ isPublished: true }, { ownerId: OWNER_ID }]);
  });

  it('returns ok when findFirst resolves the row for the owner of an unpublished recipe', async () => {
    const findFirst = jest.fn().mockResolvedValue(rowWithCount({ isPublished: false, ownerId: OWNER_ID }));
    const repo = new PrismaRecipeRepository(makePrisma(findFirst));

    const result = await repo.getById(RECIPE_ID, OWNER_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recipe.ownerId).toBe(OWNER_ID);
  });
});

// ---- (d): a different logged-in user cannot see another owner's draft -------

describe('PrismaRecipeRepository.getById — different user (currentUserId !== ownerId)', () => {
  it('sends a where clause whose ownerId branch is the requester, not the recipe owner', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new PrismaRecipeRepository(makePrisma(findFirst));

    await repo.getById(RECIPE_ID, OTHER_USER_ID);

    const where = findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ isPublished: true }, { ownerId: OTHER_USER_ID }]);
  });

  it('returns NotFoundFailure when findFirst resolves null for another owner\'s unpublished recipe', async () => {
    // Simulates Postgres excluding the row: isPublished is false and
    // ownerId (the recipe's real owner) does not match the OR's
    // { ownerId: OTHER_USER_ID } branch.
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new PrismaRecipeRepository(makePrisma(findFirst));

    const result = await repo.getById(RECIPE_ID, OTHER_USER_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

// ---- shared where-clause invariants ------------------------------------------

describe('PrismaRecipeRepository.getById — shared where-clause invariants', () => {
  it('always scopes the query to the given id and excludes soft-deleted rows', async () => {
    const findFirst = jest.fn().mockResolvedValue(rowWithCount());
    const repo = new PrismaRecipeRepository(makePrisma(findFirst));

    await repo.getById(RECIPE_ID, OWNER_ID);

    const where = findFirst.mock.calls[0][0].where;
    expect(where.id).toBe(RECIPE_ID);
    expect(where.deletedAt).toBeNull();
  });
});
