import type { PrismaClient } from '@prisma/client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';

// Regression: the list orderBy must be a total order. With a bare
// single-column orderBy, Postgres returns rows tied on that column in
// arbitrary order, so the public feed reshuffled on every silent refetch
// (e.g. returning from the recipe-detail screen). Every sort mode must
// therefore append the { createdAt } + { id } tiebreakers.

const TIEBREAKERS = [{ createdAt: 'desc' }, { id: 'desc' }];

function makePrisma(findMany: jest.Mock): PrismaClient {
  return {
    recipe: { findMany, count: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as PrismaClient;
}

async function orderByFor(sort?: string, sortOrder?: 'asc' | 'desc'): Promise<unknown> {
  const findMany = jest.fn();
  const repo = new PrismaRecipeRepository(makePrisma(findMany));
  await repo.list({
    page: 1,
    pageSize: 10,
    locale: 'en',
    ...(sort !== undefined ? { sort } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
  } as Parameters<PrismaRecipeRepository['list']>[0]);
  return findMany.mock.calls[0][0].orderBy;
}

describe('PrismaRecipeRepository.list — deterministic ordering', () => {
  it.each([
    ['time', { totalTimeMinutes: 'asc' }],
    ['rating', { rating: 'desc' }],
    ['popular', { rating: 'desc' }],
    ['mostLiked', { likes: { _count: 'desc' } }],
    ['mostCommented', { commentCount: 'desc' }],
    ['trending', { viewCount: 'desc' }],
  ])('sort=%s appends createdAt + id tiebreakers after the primary column', async (sort, primary) => {
    expect(await orderByFor(sort)).toEqual([primary, ...TIEBREAKERS]);
  });

  it('sort=newest keeps the requested direction as primary and stays total via the id tiebreaker', async () => {
    expect(await orderByFor('newest', 'asc')).toEqual([{ createdAt: 'asc' }, ...TIEBREAKERS]);
    expect(await orderByFor('newest')).toEqual([{ createdAt: 'desc' }, ...TIEBREAKERS]);
  });

  it('no sort falls back to createdAt desc and still ends with the unique id tiebreaker', async () => {
    const orderBy = await orderByFor();
    expect(Array.isArray(orderBy)).toBe(true);
    expect((orderBy as unknown[])[0]).toEqual({ createdAt: 'desc' });
    expect((orderBy as unknown[]).at(-1)).toEqual({ id: 'desc' });
  });
});
