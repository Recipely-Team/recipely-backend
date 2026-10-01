import { Prisma } from '@prisma/client';

/**
 * Most whitespace-separated words one search may require. Every word costs a
 * `LIKE` in the statement; past a handful the user is pasting, not searching.
 * Extra words are ignored rather than made unmatchable — the first few already
 * narrow the result to something they can scan.
 */
export const SEARCH_WORD_LIMIT = 8;

/**
 * Reduces a title — or a search term — to the alphabet people actually type on.
 *
 * Two foldings, in this order, because they interfere:
 *
 * 1. `İ` and `I` become `i` BEFORE `lower`. Postgres' default collation
 *    lowercases `İ` to `i` + U+0307 (combining dot above), a two-codepoint
 *    sequence no keyboard produces, so folding after `lower` would leave every
 *    capital-İ title unreachable.
 * 2. What `lower` produced is then reduced to ASCII: `ı ç ğ ö ş ü` → `i c g o s u`.
 *    Turkish is typed without diacritics constantly — on an ASCII keyboard, in a
 *    hurry, or by someone who is not sure which letter it is — and "sut" finding
 *    nothing while "süt" finds the recipe reads as a broken search box.
 *
 * Applied to BOTH sides of the comparison from this one definition, so the two
 * can never drift into folding different alphabets.
 */
export const folded = (expression: Prisma.Sql): Prisma.Sql =>
  Prisma.sql`translate(lower(translate(${expression}, 'İI', 'ii')), 'ıçğöşü', 'icgosu')`;

/** The term's words, capped at {@link SEARCH_WORD_LIMIT}; empty for a blank term. */
export const searchWords = (term: string): string[] =>
  term.split(/\s+/).filter((word) => word.length > 0).slice(0, SEARCH_WORD_LIMIT);

/**
 * `column` contains every word, each folded and matched on its own, so word
 * order stops mattering ("kek kakaolu" finds "Kakaolu Kek"). `%` and `_` in a
 * word are escaped so a search string cannot act as a wildcard. `words` must
 * not be empty — an empty join would leave a dangling `WHERE`.
 */
export const containsEveryWord = (column: Prisma.Sql, words: readonly string[]): Prisma.Sql =>
  Prisma.join(
    words.map((word) => {
      const escaped = word.replace(/([%_\\])/g, '\\$1');
      return Prisma.sql`${folded(column)} LIKE ${folded(Prisma.sql`${`%${escaped}%`}`)} ESCAPE '\\'`;
    }),
    ' AND ',
  );
