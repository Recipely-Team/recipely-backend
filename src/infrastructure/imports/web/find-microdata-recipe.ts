type JsonObject = Record<string, unknown>;

interface Scope {
  readonly type: string;
  readonly props: Map<string, unknown[]>;
}

interface Open {
  readonly tag: string;
  readonly scope: Scope | null;
  /** Set while this element's text is the value of an itemprop. */
  readonly capture: { readonly into: Scope; readonly prop: string; text: string } | null;
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>|([^<]+)/g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const VOID = new Set(['meta', 'link', 'img', 'br', 'hr', 'input', 'source', 'area', 'base', 'col', 'embed', 'wbr']);
/** Elements whose edges are line breaks, so a list of steps reads back as lines. */
const BLOCK = new Set(['li', 'p', 'br', 'div', 'ol', 'ul', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr']);
const SKIP_TEXT = new Set(['script', 'style', 'noscript']);
const RECIPE_TYPE = /(?:^|[/:])Recipe$/;
const MAX_TOKENS = 200_000;

const attrsOf = (raw: string): Map<string, string> => {
  const attrs = new Map<string, string>();
  for (const m of raw.matchAll(ATTR)) {
    const name = m[1]!.toLowerCase();
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
};

const add = (scope: Scope, prop: string, value: unknown): void => {
  for (const name of prop.split(/\s+/).filter((p) => p.length > 0)) {
    const values = scope.props.get(name) ?? [];
    values.push(value);
    scope.props.set(name, values);
  }
};

/** The value an element states in an attribute, when it states one there. */
const attributeValue = (tag: string, attrs: Map<string, string>): string | undefined => {
  if (attrs.has('content')) return attrs.get('content');
  if (tag === 'img' || tag === 'source') return attrs.get('data-lazy-src') ?? attrs.get('data-src') ?? attrs.get('src');
  if (tag === 'a' || tag === 'link') return attrs.get('href');
  if (tag === 'time') return attrs.get('datetime');
  return undefined;
};

const toObject = (scope: Scope, depth: number): JsonObject => {
  const out: JsonObject = { '@type': scope.type };
  for (const [prop, values] of scope.props) {
    const mapped = values.map((v) => (isScope(v) ? (depth > 4 ? {} : toObject(v, depth + 1)) : v));
    out[prop] = mapped.length === 1 ? mapped[0] : mapped;
  }
  return out;
};

const isScope = (v: unknown): v is Scope => typeof v === 'object' && v !== null && 'props' in v && 'type' in v;

/**
 * The page's schema.org Recipe as microdata (`itemscope` / `itemprop`), in the
 * same shape a JSON-LD node has — or `null` when there is none.
 *
 * @remarks
 * - **Why this exists beside JSON-LD.** Some of the largest Turkish recipe
 *   sites still publish their recipe as microdata only; nefisyemektarifleri.com
 *   is one. JSON-LD is tried first and this is the fallback.
 * - **Nested scopes are honoured.** An author, a comment or a video carries its
 *   own `name` and `url`; a prop belongs to the nearest enclosing `itemscope`,
 *   so the recipe's name is never a commenter's.
 * - **A prop's text keeps its line breaks** at block edges (`li`, `p`, `br`),
 *   so an `<ol itemprop="recipeInstructions">` reads back as one step a line.
 * - **Bounded.** The page is already capped by the fetcher; the token count is
 *   capped again here so a pathological page cannot pin the worker.
 */
export const findMicrodataRecipe = (html: string): JsonObject | null => {
  const stack: Open[] = [];
  const roots: Scope[] = [];
  let tokens = 0;

  const nearestScope = (): Scope | null => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const s = stack[i]!.scope;
      if (s !== null) return s;
    }
    return null;
  };
  const appendText = (text: string): void => {
    for (const open of stack) if (open.capture !== null) open.capture.text += text;
  };
  const inSkipped = (): boolean => stack.some((o) => SKIP_TEXT.has(o.tag));

  for (const m of html.matchAll(TOKEN)) {
    if (++tokens > MAX_TOKENS) break;
    const [, closing, rawTag, rawAttrs, text] = m;

    if (text !== undefined) {
      if (!inSkipped()) appendText(text);
      continue;
    }
    if (rawTag === undefined) continue;
    const tag = rawTag.toLowerCase();

    if (closing === '/') {
      if (BLOCK.has(tag)) appendText('\n');
      const at = stack.map((o) => o.tag).lastIndexOf(tag);
      if (at === -1) continue;
      for (const open of stack.splice(at)) {
        if (open.capture !== null) add(open.capture.into, open.capture.prop, open.capture.text);
      }
      continue;
    }

    if (BLOCK.has(tag)) appendText('\n');
    const attrs = attrsOf(rawAttrs ?? '');
    const prop = attrs.get('itemprop');
    const owner = nearestScope();
    const scope: Scope | null = attrs.has('itemscope')
      ? { type: attrs.get('itemtype') ?? '', props: new Map() }
      : null;

    let capture: Open['capture'] = null;
    if (scope !== null) {
      if (prop !== undefined && owner !== null) add(owner, prop, scope);
      else roots.push(scope);
    } else if (prop !== undefined && owner !== null) {
      const stated = attributeValue(tag, attrs);
      if (stated !== undefined) add(owner, prop, stated);
      else if (!VOID.has(tag)) capture = { into: owner, prop, text: '' };
    }

    if (!VOID.has(tag) && !rawAttrs?.trimEnd().endsWith('/')) stack.push({ tag, scope, capture });
  }

  const all: Scope[] = [];
  const collect = (s: Scope): void => {
    all.push(s);
    for (const values of s.props.values()) for (const v of values) if (isScope(v)) collect(v);
  };
  roots.forEach(collect);
  const recipe = all.find((s) => RECIPE_TYPE.test(s.type));
  return recipe === undefined ? null : toObject(recipe, 0);
};
