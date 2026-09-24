import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';
import { Difficulty } from '@domain/recipes/difficulty';
import { CuisineKey, isCuisineKey } from '@domain/recipes/cuisine-key';
import { RecipeCategory, isRecipeCategory } from '@domain/recipes/recipe-category';
import { isoDurationMinutes } from '@infrastructure/imports/web/iso-duration';
import { dropTrailingHeading, ingredientSections } from '@infrastructure/imports/web/ingredient-sections';

export interface PageRecipe {
  readonly recipe: GeneratedRecipeDto;
  /** The page's own photo of the dish, absolute, when it names one. */
  readonly imageUrl: string | null;
}

type JsonObject = Record<string, unknown>;

/** Mirrors the completion validator, so a long page is clipped rather than refused. */
const LIMITS = { title: 300, item: 2000, items: 100, tags: 10, minutes: 1440, servings: 100, calories: 100_000, grams: 10_000 } as const;
/** A page that names no yield: the draft is the cook's to correct, and 4 is the common default. */
const DEFAULT_SERVINGS = 4;
/** Total minutes up to which a recipe reads as easy / medium. schema.org has no difficulty. */
const EASY_MAX_MINUTES = 30;
const MEDIUM_MAX_MINUTES = 90;

const TAG = /<[^>]*>/g;
const ENTITY = /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi;
const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const FIRST_NUMBER = /\d+(?:[.,]\d+)?/;
const SLUG_SEPARATORS = /[\s-]+/g;
/** A tag stripped next to punctuation leaves `tomatoes .` behind. */
const SPACE_BEFORE_PUNCTUATION = /\s+([.,;:!?])/g;
/** yemek.com wraps notes twice: "1 su bardağı süt ((krem şanti için))". */
const DOUBLE_PARENS = /\(\(([^()]*)\)\)/g;

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A numeric entity past Unicode's last code point would make `fromCodePoint` throw. */
const MAX_CODE_POINT = 0x10ffff;
/** C0 controls and DEL: `\u0000` passes the validator and then fails Postgres text. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
/** How deeply nested lists and step sections are followed. */
const MAX_NESTING = 8;

const codePoint = (n: number): string => (Number.isInteger(n) && n > 0 && n <= MAX_CODE_POINT ? String.fromCodePoint(n) : '');

const decode = (s: string): string =>
  s.replace(ENTITY, (_, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith('#x')) return codePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return codePoint(parseInt(k.slice(1), 10));
    return NAMED[k] ?? '';
  });

/** Plain text: tags gone, entities decoded, whitespace collapsed, clipped. */
const clean = (s: unknown, max: number): string =>
  typeof s === 'string'
    ? decode(s.replace(TAG, ' ')).replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').replace(SPACE_BEFORE_PUNCTUATION, '$1').replace(DOUBLE_PARENS, '($1)').trim().slice(0, max)
    : '';

/** One flat list, however the page nested it: yemek.com wraps its lists in a second array. */
const list = (v: unknown): unknown[] =>
  Array.isArray(v) ? (v as unknown[]).flat(MAX_NESTING) : v === undefined || v === null ? [] : [v];

const texts = (v: unknown, max: number): string[] =>
  list(v).map((item) => clean(item, max)).filter((s) => s.length > 0).slice(0, LIMITS.items);

/** HowToStep / HowToSection / plain strings, flattened in reading order. */
const steps = (v: unknown, out: string[] = [], depth = 0): string[] => {
  if (depth > MAX_NESTING) return out;
  if (typeof v === 'string') {
    // A single string is either one step or several on their own lines.
    v.split(/\n+/).forEach((line) => out.push(clean(line, LIMITS.item)));
  } else if (Array.isArray(v)) {
    v.forEach((item) => steps(item, out, depth + 1));
  } else if (isObject(v)) {
    if (v['itemListElement'] !== undefined) steps(v['itemListElement'], out, depth + 1);
    else out.push(clean(v['text'] ?? v['name'], LIMITS.item));
  }
  return out.filter((s) => s.length > 0).slice(0, LIMITS.items);
};

/** Never negative: the completion validator refuses one, and the whole recipe would go with it. */
const number = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const m = typeof v === 'string' ? FIRST_NUMBER.exec(v) : null;
  return m === null ? 0 : Number(m[0].replace(',', '.'));
};

const minutes = (v: unknown): number | null => {
  const m = isoDurationMinutes(v);
  return m === null ? null : Math.min(Math.max(m, 0), LIMITS.minutes);
};

const servings = (v: unknown): number => {
  const n = Math.round(list(v).map(number).find((x) => x > 0) ?? 0);
  return n >= 1 ? Math.min(n, LIMITS.servings) : DEFAULT_SERVINGS;
};

const asKey = (v: unknown): string => clean(list(v)[0], LIMITS.title).toUpperCase().replace(SLUG_SEPARATORS, '_');

const imageOf = (v: unknown, pageUrl: string): string | null => {
  const first = list(v)[0];
  const raw = isObject(first) ? first['url'] ?? first['contentUrl'] : first;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    return new URL(raw.trim(), pageUrl).toString();
  } catch {
    return null;
  }
};

const sectionsWithinCap = (sections: string[] | null): string[] | null =>
  sections === null ? null : dropTrailingHeading(sections.slice(0, LIMITS.items));

const difficultyFor = (totalMinutes: number): Difficulty =>
  totalMinutes <= EASY_MAX_MINUTES ? Difficulty.Easy : totalMinutes <= MEDIUM_MAX_MINUTES ? Difficulty.Medium : Difficulty.Hard;

/**
 * A schema.org Recipe node as the draft a cook will edit — or `null` when it
 * does not hold enough to be one.
 *
 * @remarks
 * - **Title, at least one ingredient and one step, or nothing.** A node with
 *   a name and a photo is an article about a recipe, not a recipe, and a draft
 *   built from it would be empty where it matters.
 * - **What schema.org cannot say is derived, and says so here.** It has no
 *   difficulty, so the total time decides; a missing yield is 4. The result
 *   is a draft the cook reviews before anything is published.
 * - **Cuisine and category become our keys or the catch-all**, the same
 *   defensive mapping the video path applies to a model's free text.
 */
export const jsonLdToRecipe = (node: JsonObject, pageUrl: string, html = ''): PageRecipe | null => {
  const title = clean(node['name'] ?? node['headline'], LIMITS.title);
  const rawIngredients = node['recipeIngredient'] ?? node['ingredients'];
  const ingredients =
    sectionsWithinCap(ingredientSections(rawIngredients, html, (s) => clean(s, LIMITS.item))) ??
    texts(rawIngredients, LIMITS.item);
  const instructions = steps(node['recipeInstructions']);
  if (title.length === 0 || ingredients.length === 0 || instructions.length === 0) return null;

  const prep = minutes(node['prepTime']);
  const cook = minutes(node['cookTime']);
  const total = minutes(node['totalTime']);
  const prepTimeMinutes = prep ?? 0;
  const cookTimeMinutes = cook ?? (total !== null ? Math.max(total - prepTimeMinutes, 0) : 0);

  const cuisine = asKey(node['recipeCuisine']);
  const category = asKey(node['recipeCategory']);
  const keywords = typeof node['keywords'] === 'string' ? node['keywords'].split(',') : node['keywords'];
  const nutrition = isObject(node['nutrition']) ? node['nutrition'] : {};

  return {
    recipe: {
      title,
      cuisine: isCuisineKey(cuisine) ? cuisine : CuisineKey.Other,
      category: isRecipeCategory(category) ? category : RecipeCategory.MainCourse,
      difficulty: difficultyFor(prepTimeMinutes + cookTimeMinutes),
      prepTimeMinutes,
      cookTimeMinutes,
      servings: servings(node['recipeYield']),
      ingredients,
      instructions,
      tags: texts(keywords, LIMITS.title).slice(0, LIMITS.tags),
      mealType: [],
      tips: [],
      caloriesPerServing: Math.min(number(nutrition['calories']), LIMITS.calories),
      nutrition: {
        protein: Math.min(number(nutrition['proteinContent']), LIMITS.grams),
        carbs: Math.min(number(nutrition['carbohydrateContent']), LIMITS.grams),
        fat: Math.min(number(nutrition['fatContent']), LIMITS.grams),
        fiber: Math.min(number(nutrition['fiberContent']), LIMITS.grams),
      },
    },
    imageUrl: imageOf(node['image'], pageUrl),
  };
};
