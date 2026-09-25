import type { PrismaClient } from '@prisma/client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';

/**
 * Recipes calculated before `servingWeightGrams` existed have nutrition but no
 * weight, so the client cannot show per-100 g figures for them. The sweep's
 * query must pick those up too, not only recipes with no nutrition at all.
 */

interface SqlFragment {
  strings: readonly string[];
  values: readonly unknown[];
}

const isSqlFragment = (value: unknown): value is SqlFragment =>
  typeof value === 'object' && value !== null && 'strings' in value && 'values' in value;

const render = (strings: readonly string[], values: readonly unknown[]): string =>
  strings
    .map((chunk, index) => {
      if (index >= values.length) return chunk;
      const value = values[index];
      return chunk + (isSqlFragment(value) ? render(value.strings, value.values) : '?');
    })
    .join('');

const flatten = (values: readonly unknown[]): unknown[] =>
  values.flatMap((value) => (isSqlFragment(value) ? flatten(value.values) : [value]));

const setup = (ids: string[]) => {
  const queryRaw = jest.fn().mockResolvedValue(ids.map((id) => ({ id })));
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = { recipe: { findMany }, $queryRaw: queryRaw } as unknown as PrismaClient;
  return { repo: new PrismaRecipeRepository(prisma), queryRaw, findMany };
};

const statement = (queryRaw: jest.Mock): { sql: string; values: unknown[] } => {
  const [strings, ...values] = queryRaw.mock.calls[0] as [readonly string[], ...unknown[]];
  return { sql: render(strings, values), values: flatten(values) };
};

describe('PrismaRecipeRepository.listNeedingNutrition', () => {
  it('selects recipes with no nutrition OR nutrition without a serving weight', async () => {
    const { repo, queryRaw } = setup([]);
    await repo.listNeedingNutrition(5);

    const { sql, values } = statement(queryRaw);
    expect(sql).toMatch(/nutrition IS NULL OR nutrition->>'servingWeightGrams' IS NULL/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/ORDER BY \(nutrition IS NULL\) DESC/);
    expect(values).toEqual([5]);
  });

  it('binds the ids already attempted so the next page moves on', async () => {
    const { repo, queryRaw } = setup([]);
    await repo.listNeedingNutrition(5, ['a', 'b']);

    const { sql, values } = statement(queryRaw);
    expect(sql).toMatch(/NOT IN \(\?,\?\)/);
    expect(values).toEqual(['a', 'b', 5]);
  });

  it('loads the picked rows and skips the second query when nothing is picked', async () => {
    const empty = setup([]);
    expect(await empty.repo.listNeedingNutrition(5)).toEqual({ ok: true, value: [] });
    expect(empty.findMany).not.toHaveBeenCalled();

    const picked = setup(['x', 'y']);
    await picked.repo.listNeedingNutrition(5);
    expect(picked.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['x', 'y'] }, deletedAt: null });
  });
});
