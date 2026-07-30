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

/** A nested `Prisma.Sql` fragment, as it appears among the template's values. */
interface SqlFragment {
  strings: readonly string[];
  values: readonly unknown[];
}

const isSqlFragment = (value: unknown): value is SqlFragment =>
  typeof value === 'object' && value !== null && 'strings' in value && 'values' in value;

/** Every bind value, including those inside nested fragments. */
const flatten = (values: readonly unknown[]): unknown[] =>
  values.flatMap((value) => (isSqlFragment(value) ? flatten(value.values) : [value]));

/** The statement as Postgres would see it, with `?` where a bind value goes. */
const render = (strings: readonly string[], values: readonly unknown[]): string =>
  strings
    .map((chunk, index) => {
      if (index >= values.length) return chunk;
      const value = values[index];
      return chunk + (isSqlFragment(value) ? render(value.strings, value.values) : '?');
    })
    .join('');

const runSearch = async (search: string): Promise<{ values: unknown[]; sql: string }> => {
  const queryRaw = jest.fn().mockResolvedValue([]);
  const repo = new PrismaRecipeRepository(makePrisma(queryRaw));

  await repo.list({ page: 1, pageSize: 10, locale: 'en', search } as Query);

  const [strings, ...values] = queryRaw.mock.calls[0] as [readonly string[], ...unknown[]];
  return { values: flatten(values), sql: render(strings, values) };
};

/** The interpolated values of the tagged-template raw query. */
const rawValuesFor = async (search: string): Promise<unknown[]> => (await runSearch(search)).values;

/** The rendered statement text of the raw query. */
const rawSqlFor = async (search: string): Promise<string> => (await runSearch(search)).sql;

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

  describe('folding', () => {
    it('folds İ and I to i before lowercasing, on both sides of the comparison', async () => {
      const sql = await rawSqlFor('İzmir');

      // After `lower`, Postgres' "İ" is i + U+0307 — a sequence no keyboard
      // produces — so the fold has to happen first or capital-İ titles are
      // unreachable. Both operands are folded from the same definition.
      expect(sql).toContain("lower(translate(translated.title, 'İI', 'ii'))");
      expect(sql.match(/translate\(lower\(translate\(/g)).toHaveLength(2);
    });

    it('folds Turkish diacritics down to ASCII so an undotted query still matches', async () => {
      // "sut" must find "süt": Turkish is typed without diacritics constantly.
      expect(await rawSqlFor('sut')).toContain("'ıçğöşü', 'icgosu'");
    });
  });

  describe('multi-word terms', () => {
    it('requires every word separately, so the order they were typed does not matter', async () => {
      const sql = await rawSqlFor('kek kakaolu');

      // One `LIKE '%kek kakaolu%'` matched the phrase verbatim: "kakaolu kek"
      // found the recipe and "kek kakaolu" found nothing.
      expect(sql.match(/LIKE/g)).toHaveLength(2);
      expect(sql).toContain('AND');
    });

    it('passes each word as its own wildcarded value', async () => {
      const values = await rawValuesFor('kek kakaolu');

      expect(values).toContain('%kek%');
      expect(values).toContain('%kakaolu%');
      expect(values).not.toContain('%kek kakaolu%');
    });

    it('requires the words within one locale, not one word per translation', async () => {
      const sql = await rawSqlFor('cake kek');

      // Both LIKEs read the same `translated.title`, so a match cannot be
      // assembled by taking "cake" from the English name and "kek" from the
      // Turkish one.
      expect(sql.match(/translated\.title/g)).toHaveLength(2);
    });

    it('collapses repeated whitespace instead of requiring an empty word', async () => {
      expect(await rawValuesFor('kek   kakaolu')).not.toContain('%%');
    });

    it('caps how many words one search may require', async () => {
      const sql = await rawSqlFor('a b c d e f g h i j k l');

      expect(sql.match(/LIKE/g)).toHaveLength(8);
    });

    it('still matches a single word exactly as before', async () => {
      const sql = await rawSqlFor('baklava');

      expect(sql.match(/LIKE/g)).toHaveLength(1);
      expect(await rawValuesFor('baklava')).toContain('%baklava%');
    });
  });

  it('returns a Failure instead of rejecting when the search statement throws', async () => {
    const queryRaw = jest.fn().mockRejectedValue(new Error('connection terminated'));
    const repo = new PrismaRecipeRepository(makePrisma(queryRaw));

    const result = await repo.list({ page: 1, pageSize: 10, locale: 'en', search: 'baklava' } as Query);

    expect(result.ok).toBe(false);
  });
});
