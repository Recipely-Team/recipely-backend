import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaDiaryRecipeSearch } from '@infrastructure/repositories/diary/prisma-diary-recipe-search';
import type { DiaryRecipeGroupType } from '@application/diary/diary-food-group';

const USER = 'u1';

async function searched(group: DiaryRecipeGroupType, page = 1, pageSize = 20) {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(42);
  const queryRaw = jest.fn().mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
  const prisma = {
    $queryRaw: queryRaw,
    recipe: { findMany, count },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaClient;
  const result = await new PrismaDiaryRecipeSearch(prisma).search({ userId: USER, term: 'ayran', group, page, pageSize });
  const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
  const ids = Prisma.sql(strings, ...values);
  return { result, args: findMany.mock.calls[0][0], countWhere: count.mock.calls[0][0].where, ids: { text: ids.text.replace(/\s+/g, ' '), values: ids.values } };
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

// The id statement caps at 500 matches. Filtering by owner / favourite only
// AFTER it spent the cap on everyone's recipes: with more than 500 public
// matches a user's own "Ayran" could fall outside it and vanish from `mine` —
// the very bug the server-side search exists to fix. The filter now runs
// inside the capped statement.
describe('PrismaDiaryRecipeSearch — the group filter runs before the 500-id cap', () => {
  const favourited = 'EXISTS (SELECT 1 FROM favorites fv WHERE fv.recipe_id = recipes.id AND fv.user_id = $';

  it.each([
    ['mine', [/owner_id = \$\d+::uuid AND NOT EXISTS \(SELECT 1 FROM favorites fv/]],
    ['saved', [/AND \(is_published OR owner_id = \$\d+::uuid\)/]],
    ['recipes', [/is_published AND owner_id <> \$\d+::uuid AND NOT EXISTS/]],
  ] as const)('%s', async (group, patterns) => {
    const { ids } = await searched(group);
    const [before] = ids.text.split('LIMIT');
    for (const pattern of patterns) expect(before).toMatch(pattern);
    expect(ids.text).toMatch(/ORDER BY id LIMIT \$\d+ ?$/);
    if (group !== 'recipes') expect(ids.values).toContain(USER);
    expect(ids.text.includes(favourited)).toBe(true);
  });
});

describe('PrismaDiaryRecipeSearch — a group listed whole (no term)', () => {
  function browse() {
    const recipeFindMany = jest.fn().mockResolvedValue([]);
    const favoriteFindMany = jest.fn().mockResolvedValue([]);
    const queryRaw = jest.fn();
    const prisma = {
      $queryRaw: queryRaw,
      recipe: { findMany: recipeFindMany, count: jest.fn().mockResolvedValue(3) },
      favorite: { findMany: favoriteFindMany, count: jest.fn().mockResolvedValue(2) },
      $transaction: (ops: unknown[]) => Promise.all(ops),
    } as unknown as PrismaClient;
    return { search: new PrismaDiaryRecipeSearch(prisma), recipeFindMany, favoriteFindMany, queryRaw };
  }

  it('mine: every own live recipe, drafts included, newest first — no search statement', async () => {
    const { search, recipeFindMany, queryRaw } = browse();
    const result = await search.search({ userId: USER, group: 'mine', page: 2, pageSize: 10 });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(recipeFindMany.mock.calls[0][0]).toMatchObject({
      where: { ownerId: USER, deletedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 10, take: 10,
    });
    expect(result).toEqual({ ok: true, value: { items: [], total: 3, page: 2, pageSize: 10 } });
  });

  it('recipes: the public feed — every published recipe, newest first', async () => {
    const { search, recipeFindMany } = browse();
    await search.search({ userId: USER, group: 'recipes', page: 1, pageSize: 20 });
    expect(recipeFindMany.mock.calls[0][0].where).toEqual({ isPublished: true, deletedAt: null });
  });

  it('saved: readable favourites in the order they were saved, newest first', async () => {
    const { search, favoriteFindMany, recipeFindMany } = browse();
    favoriteFindMany.mockResolvedValue([]);
    const result = await search.search({ userId: USER, group: 'saved', page: 1, pageSize: 20 });
    expect(recipeFindMany).not.toHaveBeenCalled();
    expect(favoriteFindMany.mock.calls[0][0]).toMatchObject({
      where: { userId: USER, recipe: { deletedAt: null, OR: [{ isPublished: true }, { ownerId: USER }] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { recipe: { include: { media: { orderBy: { position: 'asc' } } } } },
    });
    expect(result.ok && result.value.total).toBe(2);
  });
});
