import type { PrismaClient } from '@prisma/client';
import { PrismaRecipeLikeRepository } from '@infrastructure/repositories/likes/prisma-recipe-like-repository';

// The "Liked" tab in My Recipes reads this query. Three things about it are
// load-bearing and none of them are visible from the call site:
//   - a recipe the owner deleted must not resurface in someone's liked list,
//   - the list is ordered by WHEN the like happened, not by the recipe,
//   - page 2 must actually skip page 1 (CLAUDE.md rule 23d).

function makePrisma(findMany: jest.Mock, count: jest.Mock): PrismaClient {
  return {
    recipeLike: { findMany, count },
    // The repository calls both inside one $transaction; resolve the shape it
    // destructures.
    $transaction: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as PrismaClient;
}

async function listArgsFor(page: number, pageSize: number): Promise<Record<string, unknown>> {
  const findMany = jest.fn();
  const count = jest.fn();
  const repo = new PrismaRecipeLikeRepository(makePrisma(findMany, count));
  await repo.listForUser('user-1', page, pageSize);
  return findMany.mock.calls[0][0] as Record<string, unknown>;
}

describe('PrismaRecipeLikeRepository.listForUser', () => {
  it('excludes recipes that have been soft-deleted', async () => {
    const args = await listArgsFor(1, 20);
    expect(args.where).toEqual({ userId: 'user-1', recipe: { deletedAt: null } });
  });

  it('orders by when the like was left, newest first', async () => {
    const args = await listArgsFor(1, 20);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('skips the pages before the one requested', async () => {
    expect(await listArgsFor(1, 20)).toMatchObject({ skip: 0, take: 20 });
    expect(await listArgsFor(3, 20)).toMatchObject({ skip: 40, take: 20 });
  });

  it('counts with the same filter it lists with', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const repo = new PrismaRecipeLikeRepository(makePrisma(findMany, count));

    await repo.listForUser('user-1', 2, 10);

    expect(count.mock.calls[0][0]).toEqual({
      where: { userId: 'user-1', recipe: { deletedAt: null } },
    });
  });

  it('returns an ok page result when the user has liked nothing', async () => {
    const repo = new PrismaRecipeLikeRepository(makePrisma(jest.fn(), jest.fn()));

    const result = await repo.listForUser('user-1', 1, 20);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});
