import { createHash } from 'node:crypto';

/** One line as the gate compares it: trimmed, inner whitespace collapsed, lower-cased. */
const normalizeLine = (line: string): string => line.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * A sha256 over a list of lines, blind to spacing and case.
 *
 * @remarks
 * - **Why a hash and not the text.** The gate only ever asks "is this still
 *   what the site said?", and a digest answers that without storing a second
 *   copy of somebody else's recipe on every row.
 * - **Normalised first**, so re-typing a line with different capitals or an
 *   extra space is not mistaken for rewriting it.
 */
export const fingerprintLines = (lines: readonly string[]): string =>
  createHash('sha256').update(lines.map(normalizeLine).join('\n')).digest('hex');
