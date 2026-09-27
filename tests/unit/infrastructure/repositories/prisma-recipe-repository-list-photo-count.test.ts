import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';
import type { PrismaClient, RecipeMedia } from '@prisma/client';

// A feed card's photo-count chip reads `mediaCount`, which is derived from the
// media rows the list query already loads in the same `$transaction` — one
// batched relation read for the whole page, never a query per recipe. These
// tests pin both halves: the include is on the page query, and the count
// reaches the listed recipe.

function row(id: string, media: RecipeMedia[]): unknown {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id,
    name: { en: 'Pasta' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta'] },
    instructions: { en: ['boil'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/cover.jpg',
    rating: 4,
    tags: { en: [] },
    mealType: { en: [] },
    ownerId: 'owner-1',
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
    media,
    _count: { likes: 0 },
  };
}

const mediaRow = (id: string, type: string, position: number): RecipeMedia =>
  ({ id, recipeId: 'r1', type, url: `https://example.com/${id}`, position, createdAt: new Date(0) }) as RecipeMedia;

function makeRepo(rows: unknown[]): { repo: PrismaRecipeRepository; findMany: jest.Mock } {
  const findMany = jest.fn();
  const prisma = {
    recipe: { findMany, count: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([rows, rows.length]),
  } as unknown as PrismaClient;
  return { repo: new PrismaRecipeRepository(prisma), findMany };
}

const query = { page: 1, pageSize: 10, locale: 'en' } as Parameters<PrismaRecipeRepository['list']>[0];

describe('PrismaRecipeRepository.list — photo count for the card chip', () => {
  it('loads the media relation in the page query itself, not per recipe', async () => {
    const { repo, findMany } = makeRepo([]);

    await repo.list(query);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].include.media).toEqual({ orderBy: { position: 'asc' } });
  });

  it('gives each listed recipe the number of its gallery images', async () => {
    const { repo } = makeRepo([
      row('r1', [mediaRow('a', 'image', 0), mediaRow('b', 'image', 1), mediaRow('c', 'video', 2)]),
      row('r2', []),
    ]);

    const result = await repo.list(query);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.map((r) => r.photoCount())).toEqual([2, 1]);
  });
});
