import { findJsonLdRecipe } from '@infrastructure/imports/web/find-json-ld-recipe';
import { findMicrodataRecipe } from '@infrastructure/imports/web/find-microdata-recipe';
import { jsonLdToRecipe } from '@infrastructure/imports/web/json-ld-to-recipe';

/**
 * Parsing is synchronous, so no timeout can stop it: a page crafted to make a
 * regex rescan itself, or to make the microdata reader pile up text, would
 * pin a 1 GB worker for minutes or kill it outright. Each of these took
 * seconds to minutes, or ran out of heap, before the parsers were bounded.
 * The fetcher caps a page at 3 MB, so that is the size tested.
 */
const PAGE_CAP = 3_000_000;
const BUDGET_MS = 2_000;

const within = (html: string, parse: (h: string) => unknown): number => {
  const start = Date.now();
  parse(html);
  return Date.now() - start;
};

describe('a hostile page cannot pin the worker', () => {
  it.each([
    ['unclosed script tags', '<script'],
    ['unclosed comments', '<!--'],
    ['unclosed tags', '<a'],
  ])('JSON-LD scan over %s', (_why, unit) => {
    expect(within(unit.repeat(Math.floor(PAGE_CAP / unit.length)), findJsonLdRecipe)).toBeLessThan(BUDGET_MS);
  });

  it.each([
    ['unclosed comments', '<!--'],
    ['unclosed tags', '<a'],
    ['deep nesting', '<div>'],
  ])('microdata scan over %s', (_why, unit) => {
    expect(within(unit.repeat(Math.floor(PAGE_CAP / unit.length)), findMicrodataRecipe)).toBeLessThan(BUDGET_MS);
  });

  it('microdata with thousands of open captures neither runs away nor exhausts memory', () => {
    const html = '<div itemscope itemtype="https://schema.org/Recipe">' + '<b itemprop=a>'.repeat(20_000) + 'x<i>'.repeat(20_000);
    expect(within(html, findMicrodataRecipe)).toBeLessThan(BUDGET_MS);
  });

  it('deeply nested scopes do not overflow the stack', () => {
    const html = '<div itemprop=a itemscope>'.repeat(50_000);
    expect(() => findMicrodataRecipe(`<div itemscope>${html}`)).not.toThrow();
  });

  it('deeply nested JSON-LD lists and steps do not overflow the stack', () => {
    let nested: unknown = 'Step.';
    for (let i = 0; i < 10_000; i++) nested = [nested];
    const node = { '@type': 'Recipe', name: 'X', recipeIngredient: nested, recipeInstructions: nested };
    expect(() => jsonLdToRecipe(node, 'https://example.com/')).not.toThrow();
  });
});

describe('values the completion validator would refuse', () => {
  const base = { '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], recipeInstructions: ['Do it.'] };

  // One bad nutrition field used to take the whole recipe with it: the
  // validator's min(0) refused the completion and the import failed.
  it('never reports a negative quantity', () => {
    const r = jsonLdToRecipe({ ...base, nutrition: { calories: -50, proteinContent: -3, fatContent: 'lots' } }, 'https://e.com/')!.recipe;
    expect(r.caloriesPerServing).toBe(0);
    expect(r.nutrition.protein).toBe(0);
    expect(r.nutrition.fat).toBe(0);
  });

  it('drops an entity past the last code point instead of throwing', () => {
    expect(() => jsonLdToRecipe({ ...base, name: 'Pie &#x110000; &#0;' }, 'https://e.com/')).not.toThrow();
  });

  it('strips control characters Postgres text cannot hold', () => {
    const r = jsonLdToRecipe({ ...base, name: 'Pie\u0000 time' }, 'https://e.com/')!.recipe;
    expect(r.title).toBe('Pie time');
  });
});
