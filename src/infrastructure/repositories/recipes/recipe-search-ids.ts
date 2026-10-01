import { Prisma, type PrismaClient } from '@prisma/client';
import { containsEveryWord, searchWords } from '@infrastructure/prisma/folded-search-sql';

/** Most ids a single search feeds into an `IN (…)` filter. */
export const SEARCH_MATCH_LIMIT = 500;

/**
 * **Ids of live recipes whose name matches `term`**, case- and alphabet-folded
 * — the home search's matching, shared with the diary food search.
 *
 * @remarks
 * - `jsonb_each_text` walks every locale a recipe carries, so ONE statement
 *   covers them all — a user typing a Turkish title finds it whatever language
 *   the app is in. It compares the VALUES only: matching against `name::text`
 *   would also see the locale keys, and a search for "en" or "tr" would then
 *   match the entire catalogue. The `::jsonb` cast is a no-op on the deployed
 *   databases (both are jsonb already) and keeps the statement valid against
 *   the `@db.Json` the schema declares.
 * - Each WORD of the term is required separately, all against the same title
 *   ({@link containsEveryWord}). A single `LIKE '%kek kakaolu%'` matched the
 *   phrase verbatim, so "kakaolu kek" found the recipe and "kek kakaolu" found
 *   nothing. They are matched within ONE locale's title rather than across the
 *   object, so "cake kek" doesn't match by taking a word from each translation.
 * - Capped: the ids come back as an `IN (…)` list, and a term like "a" would
 *   otherwise pull the whole catalogue through it. The cap is ordered, because
 *   each page of a search calls this again — an unordered LIMIT could hand page
 *   2 a different 500 rows than page 1 and make the paging incoherent. Soft-
 *   deleted rows are excluded so they cannot consume slots under the cap.
 * - `scope` narrows the rows BEFORE the cap. A caller that filters further
 *   (whose recipes, which favourites) must pass that filter here: applied
 *   after, the cap is spent on other rows and the ones it wants can fall
 *   outside the first 500 — a user's own recipe "missing" from a search that
 *   matched it.
 */
export async function recipeSearchIds(prisma: PrismaClient, term: string, scope: Prisma.Sql = Prisma.sql`TRUE`): Promise<string[]> {
  const words = searchWords(term);
  if (words.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM recipes
    WHERE deleted_at IS NULL
      AND ${scope}
      AND EXISTS (
        SELECT 1 FROM jsonb_each_text(name::jsonb) AS translated(locale, title)
        WHERE ${containsEveryWord(Prisma.raw('translated.title'), words)}
      )
    ORDER BY id
    LIMIT ${SEARCH_MATCH_LIMIT}
  `;
  return rows.map((row) => row.id);
}
