import type { PrismaClient } from '@prisma/client';
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
  const [strings] = queryRaw.mock.calls[0] as [readonly string[]];
  return { result, sql: strings.join('?').replace(/\s+/g, ' ') };
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
    expect(sql).toContain('DISTINCT ON (lower(f.name), f."recipeId")');
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
