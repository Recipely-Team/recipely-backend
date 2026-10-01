import type { PrismaClient } from '@prisma/client';
import { PrismaDiaryRecipeSearch } from '@infrastructure/repositories/diary/prisma-diary-recipe-search';
import type { DiaryRecipeGroupType } from '@application/diary/diary-food-group';

const USER = 'u1';

async function searched(group: DiaryRecipeGroupType, page = 1, pageSize = 20) {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(42);
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]),
    recipe: { findMany, count },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaClient;
  const result = await new PrismaDiaryRecipeSearch(prisma).search({ userId: USER, term: 'ayran', group, page, pageSize });
  return { result, args: findMany.mock.calls[0][0], countWhere: count.mock.calls[0][0].where };
}

const matching = { id: { in: ['r1', 'r2'] }, deletedAt: null };
const favourited = { favorites: { some: { userId: USER } } };

describe('PrismaDiaryRecipeSearch', () => {
  it('saved: my favourites I can still read', async () => {
    const { args } = await searched('saved');
    expect(args.where).toEqual({ ...matching, ...favourited, OR: [{ isPublished: true }, { ownerId: USER }] });
  });

  it('mine: my own recipes in any status — drafts and pending included — not already saved', async () => {
    const { args } = await searched('mine');
    expect(args.where).toEqual({ ...matching, ownerId: USER, NOT: favourited });
    expect(args.where).not.toHaveProperty('isPublished');
  });

  it("recipes: other users' published ones I have not saved", async () => {
    const { args } = await searched('recipes');
    expect(args.where).toEqual({ ...matching, isPublished: true, ownerId: { not: USER }, NOT: favourited });
  });

  it('pages newest first with a stable tie-break, counting the same filter', async () => {
    const { result, args, countWhere } = await searched('recipes', 3, 10);
    expect(args).toMatchObject({ skip: 20, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    expect(countWhere).toEqual(args.where);
    expect(result).toEqual({ ok: true, value: { items: [], total: 42, page: 3, pageSize: 10 } });
  });
});
