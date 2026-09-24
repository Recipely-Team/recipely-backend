const SCRIPT_OPEN = '<script';
const SCRIPT_CLOSE = '</script';
const LD_JSON_TYPE = /\btype\s*=\s*["']?application\/ld\+json/i;

/**
 * Where `tag` (lowercase) next starts in `html`, compared case-insensitively
 * one candidate at a time. The page itself is never lowercased: `'İ'` lowercases
 * to two code units, so positions found in a lowercased copy drift by one per
 * capital İ — and "İletişim" sits in the menu of nearly every Turkish site.
 */
const findTag = (html: string, tag: string, from: number): number => {
  for (let i = html.indexOf('<', from); i !== -1; i = html.indexOf('<', i + 1)) {
    if (html.slice(i, i + tag.length).toLowerCase() === tag) return i;
  }
  return -1;
};
const RECIPE_TYPE = /(?:^|[/:])Recipe$/;
/** How deep a graph is walked. Real pages nest a recipe two or three levels in. */
const MAX_DEPTH = 6;

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

const isRecipe = (node: JsonObject): boolean => {
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === 'string' && RECIPE_TYPE.test(t));
};

const findIn = (value: unknown, depth: number): JsonObject | null => {
  if (depth > MAX_DEPTH) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findIn(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  if (isRecipe(value)) return value;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const found = findIn(value[key], depth + 1);
    if (found !== null) return found;
  }
  return null;
};

/**
 * The body of every `<script type="application/ld+json">` on the page.
 *
 * Scanned by position, not with a regex: a lazy `[\s\S]*?<\/script>` rescans
 * to the end of the page for every unclosed `<script`, which a hostile page
 * turns into minutes of CPU on the worker — and parsing is synchronous, so no
 * timeout can interrupt it.
 */
const ldJsonBlocks = (html: string): string[] => {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const open = findTag(html, SCRIPT_OPEN, from);
    if (open === -1) break;
    const tagEnd = html.indexOf('>', open);
    if (tagEnd === -1) break;
    const close = findTag(html, SCRIPT_CLOSE, tagEnd);
    if (close === -1) break;
    if (LD_JSON_TYPE.test(html.slice(open, tagEnd))) blocks.push(html.slice(tagEnd + 1, close));
    from = close + SCRIPT_CLOSE.length;
  }
  return blocks;
};

/**
 * The page's schema.org Recipe node, or `null` when it has none.
 *
 * @remarks
 * - **Every JSON-LD block is tried**, because a page usually carries several —
 *   the site, the breadcrumb, the article — and the recipe is rarely first.
 * - **`@graph`, arrays and `mainEntity` are walked**, which is where Yoast,
 *   WP Recipe Maker and Tasty put it. `@type` may be a string or a list, and
 *   may be written as a full schema.org IRI.
 * - **A block that does not parse is skipped, not fatal.** Hand-edited markup
 *   with a stray comma is common, and one broken block should not hide a
 *   good one further down the page.
 */
export const findJsonLdRecipe = (html: string): JsonObject | null => {
  for (const block of ldJsonBlocks(html)) {
    const text = block.trim();
    if (text.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const found = findIn(parsed, 0);
    if (found !== null) return found;
  }
  return null;
};
