// `[^<>]` keeps it linear: a run of unclosed `<` cannot make each one rescan the page.
const TAG = /<[^<>]*>/g;
const HEADING = /^[^\d]{2,80}:$/u;
/** How many visible lines above a section's first ingredient its heading may sit. */
const HEADING_REACH = 4;
const MIN_PROBE = 3;
const GROUP_PREFIX = '# ';

/** The page's visible text, one line per text node: markup inside an item splits it, never joins two. */
const visibleLines = (html: string): string[] =>
  html.replace(TAG, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 0);

/**
 * The page's own ingredient sections, as `# heading` lines followed by each
 * section's items — or `null` when the page has none or they cannot be named.
 *
 * @remarks
 * - **Why.** yemek.com, among others, gives `recipeIngredient` as a list of
 *   lists — one per part of the dish — and keeps the parts' names only in the
 *   visible page. Flattening it put a trileçe's cake, caramel and milk syrup
 *   into one list.
 * - **The name is the heading just above each section's first ingredient**
 *   ("Trileçenin karameli için:"), a few visible lines up, found in the
 *   page's text with its markup taken out — an item is often split by it
 *   (`<span>5 adet</span> büyük boy yumurta`). If any section cannot be named, the list stays flat: a heading
 *   invented from nothing would be worse than none.
 */
export const ingredientSections = (
  raw: unknown,
  html: string,
  clean: (s: unknown) => string,
): string[] | null => {
  if (!Array.isArray(raw) || raw.length < 2 || !raw.every(Array.isArray)) return null;

  const lines = visibleLines(html);
  const out: string[] = [];
  let from = 0;
  for (const section of raw as unknown[][]) {
    const items = section.map(clean).filter((s) => s.length > 0);
    const first = items[0];
    if (first === undefined) continue;
    // The first line of the item as the page renders it: "5 adet" of "5 adet büyük boy yumurta".
    const at = lines.findIndex((l, i) => i >= from && l.length >= MIN_PROBE && first.startsWith(l));
    if (at === -1) return null;
    const heading = lines.slice(Math.max(from, at - HEADING_REACH), at).reverse().find((l) => HEADING.test(l));
    if (heading === undefined) return null;
    out.push(`${GROUP_PREFIX}${clean(heading)}`, ...items);
    from = at + 1;
  }
  return out.length > 0 ? out : null;
};

/** A heading left last by the item cap has nothing under it; it goes. */
export const dropTrailingHeading = (lines: string[]): string[] =>
  lines.length > 0 && lines[lines.length - 1]!.startsWith(GROUP_PREFIX) ? lines.slice(0, -1) : lines;
