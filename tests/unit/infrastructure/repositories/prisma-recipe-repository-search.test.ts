import type { PrismaClient } from '@prisma/client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';

/**
 * Reported as "search is a bit broken". It was: Prisma's JSON `string_contains`
 * is case-SENSITIVE and matches one locale at a time, so "baklava" never found
 * "Fıstıklı Baklava" and an English-locale user never found a Turkish title.
 * Matching ids now come from one raw statement that folds case and the Turkish
 * i forms across the whole name object.
 */

type Query = Parameters<PrismaRecipeRepository['list']>[0];

const makePrisma = (
  queryRaw: jest.Mock,
  findMany: jest.Mock = jest.fn(),
): PrismaClient =>
  ({
    recipe: { findMany, count: jest.fn() },
    $queryRaw: queryRaw,
    $transaction: jest.fn().mockResolvedValue([[], 0]),
  }) as unknown as PrismaClient;

/** The `where` the list query was ultimately built with. */
const whereFor = async (search: string | undefined, matches: string[] = []): Promise<Record<string, unknown>> => {
  const findMany = jest.fn();
  const queryRaw = jest.fn().mockResolvedValue(matches.map((id) => ({ id })));
  const repo = new PrismaRecipeRepository(makePrisma(queryRaw, findMany));

  await repo.list({
    page: 1,
    pageSize: 10,
    locale: 'en',
    ...(search !== undefined ? { search } : {}),
  } as Query);

  return findMany.mock.calls[0][0].where as Record<string, unknown>;
};

/** The interpolated values of the tagged-template raw query. */
const rawValuesFor = async (search: string): Promise<unknown[]> => {
  const queryRaw = jest.fn().mockResolvedValue([]);
  const repo = new PrismaRecipeRepository(makePrisma(queryRaw));

  await repo.list({ page: 1, pageSize: 10, locale: 'en', search } as Query);

  return queryRaw.mock.calls[0].slice(1);
};

describe('PrismaRecipeRepository.list — search', () => {
  it('filters by the ids the search statement returned', async () => {
    expect(await whereFor('baklava', ['r-1', 'r-2'])).toMatchObject({ id: { in: ['r-1', 'r-2'] } });
  });

  it('matches nothing when the search matched nothing — never everything', async () => {
    expect(await whereFor('nothing-matches-this', [])).toMatchObject({ id: { in: [] } });
  });

  it('runs no search statement when there is no term', async () => {
    const where = await whereFor(undefined);

    expect(where.id).toBeUndefined();
  });

  it('ignores a whitespace-only term', async () => {
    expect((await whereFor('   ')).id).toBeUndefined();
  });

  it('wraps the term in wildcards so it matches anywhere in the name', async () => {
    expect(await rawValuesFor('baklava')).toContain('%baklava%');
  });

  it('escapes wildcards typed by the user, so "50%" is not a match-anything', async () => {
    expect(await rawValuesFor('50%')).toContain('%50\\%%');
  });

  it('escapes the single-character wildcard too', async () => {
    expect(await rawValuesFor('a_b')).toContain('%a\\_b%');
  });

  it('caps how many ids one search can feed into the filter', async () => {
    expect(await rawValuesFor('a')).toContain(500);
  });

  it('returns a Failure instead of rejecting when the search statement throws', async () => {
    const queryRaw = jest.fn().mockRejectedValue(new Error('connection terminated'));
    const repo = new PrismaRecipeRepository(makePrisma(queryRaw));

    const result = await repo.list({ page: 1, pageSize: 10, locale: 'en', search: 'baklava' } as Query);

    expect(result.ok).toBe(false);
  });
});
