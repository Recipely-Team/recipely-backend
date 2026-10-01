import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaFoodDiaryRepository } from '@infrastructure/repositories/diary/prisma-food-diary-repository';

/**
 * Re-logging a recent food failed with `not_found.recipe` once the recipe it
 * was logged from had been deleted or unpublished: the recent list still
 * offered the dead `recipeId`, and POST /diary/entries rightly refuses a
 * recipe the user cannot read. The recent query now applies the same
 * readability rule as `getById` and hands such a food back unlinked.
 */

const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'e1',
  userId: 'u1',
  date: new Date('2026-09-30T00:00:00.000Z'),
  meal: 'LUNCH',
  name: 'Menemen',
  servings: 2,
  calories: 600,
  protein: 30,
  carbs: null,
  fat: 40,
  fiber: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  recipeId: null,
  recipeImageUrl: null,
  ...overrides,
});

const recentSql = async (rows: Record<string, unknown>[] = []) => {
  const queryRaw = jest.fn().mockResolvedValue(rows);
  const repo = new PrismaFoodDiaryRepository({ $queryRaw: queryRaw } as unknown as PrismaClient);
  const result = await repo.listRecent('u1', 20);
  // The statement nests a Prisma.Sql fragment; Prisma.sql flattens it the way $queryRaw does.
  const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
  return { result, sql: Prisma.sql(strings, ...values).sql.replace(/\s+/g, ' ') };
};

describe('PrismaFoodDiaryRepository.listRecent — unreadable recipes', () => {
  it('links a recipe only while it is live and published or the user’s own', async () => {
    const { sql } = await recentSql();
    expect(sql).toContain(
      'r.id IS NOT NULL AND r.deleted_at IS NULL AND (r.is_published OR r.owner_id = e.user_id) AS ok',
    );
    expect(sql).toContain('CASE WHEN readable.ok THEN e.recipe_id END AS "recipeId"');
    expect(sql).toContain('CASE WHEN readable.ok THEN r.image END AS "recipeImageUrl"');
  });

  it('dedupes on the effective link, so an unlinked food is not listed twice', async () => {
    const { sql } = await recentSql();
    expect(sql).toContain('DISTINCT ON (lower(f.name), f."recipeId", f."foodVariantId", f."offBarcode")');
  });

  it('maps an unlinked row to recipeId and recipeImageUrl null, keeping unknown macros null', async () => {
    const { result } = await recentSql([row()]);
    if (!result.ok) throw new Error(result.failure.messageKey);
    const [record] = result.value;
    expect(record?.entry.recipeId).toBeNull();
    expect(record?.recipeImageUrl).toBeNull();
    expect(record?.entry.nutrients.values.carbs).toBeNull();
  });
});

describe('PrismaFoodDiaryRepository.listRecentPage', () => {
  it('pages the same distinct foods, newest first, with their count in one transaction', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const queryRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Prisma.sql(strings, ...values);
      calls.push({ text: sql.text.replace(/\s+/g, ' '), values: sql.values });
      return calls.length === 1
        ? [row({ productSource: 'curated', foodVariantId: 'v1', offBarcode: null, unitKey: 'glass', unitAmount: 200 })]
        : [{ total: 7 }];
    });
    const prisma = { $queryRaw: queryRaw, $transaction: (ops: unknown[]) => Promise.all(ops) } as unknown as PrismaClient;

    const result = await new PrismaFoodDiaryRepository(prisma).listRecentPage('u1', 2, 3);

    expect(calls[0]?.text).toContain('DISTINCT ON (lower(f.name), f."recipeId", f."foodVariantId", f."offBarcode")');
    expect(calls[0]?.text).toMatch(/ORDER BY "createdAt" DESC, id DESC LIMIT \$\d+ OFFSET \$\d+$/);
    expect(calls[0]?.values.slice(-2)).toEqual([3, 3]);
    expect(calls[1]?.text).toContain('SELECT COUNT(*)::int AS total FROM ( SELECT DISTINCT ON');
    expect(result.ok && result.value.total).toBe(7);
    expect(result.ok && result.value.items[0]?.entry.product?.props).toEqual({
      source: 'curated', foodVariantId: 'v1', offBarcode: null, unitKey: 'glass', unitAmount: 200,
    });
  });
});
