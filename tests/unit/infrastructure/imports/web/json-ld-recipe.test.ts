import { findJsonLdRecipe } from '@infrastructure/imports/web/find-json-ld-recipe';
import { jsonLdToRecipe } from '@infrastructure/imports/web/json-ld-to-recipe';
import { isoDurationMinutes } from '@infrastructure/imports/web/iso-duration';

const PAGE = 'https://www.example.com/recipes/menemen/';
const page = (...blocks: string[]): string =>
  `<html><head>${blocks.map((b) => `<script type="application/ld+json">${b}</script>`).join('')}</head></html>`;

// The shape Yoast + WP Recipe Maker emit: the recipe sits inside @graph, after
// the site and the article, with sections of HowToSteps and an ImageObject.
const YOAST = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: 'Example' },
    { '@type': ['Article'], headline: 'Our menemen' },
    {
      '@type': ['Recipe'],
      name: 'Menemen &amp; Bread',
      image: [{ '@type': 'ImageObject', url: '/img/menemen.jpg' }],
      recipeYield: ['2', '2 servings'],
      prepTime: 'PT10M',
      totalTime: 'PT25M',
      recipeCuisine: 'Turkish',
      recipeCategory: 'Breakfast',
      keywords: 'eggs, tomato, <b>quick</b>',
      recipeIngredient: ['3 eggs', '2 tomatoes', ''],
      recipeInstructions: [
        { '@type': 'HowToSection', name: 'Prep', itemListElement: [{ '@type': 'HowToStep', text: 'Chop the <em>tomatoes</em>.' }] },
        { '@type': 'HowToStep', text: 'Cook with the eggs.' },
      ],
      nutrition: { calories: '320 kcal', proteinContent: '18 g', fatContent: '21,5 g' },
    },
  ],
});

describe('reading a recipe off a page', () => {
  it('finds the recipe inside @graph, past the blocks that are not one', () => {
    const node = findJsonLdRecipe(page(YOAST));
    expect(node?.['name']).toBe('Menemen &amp; Bread');
  });

  it('skips a block that does not parse instead of giving up on the page', () => {
    const node = findJsonLdRecipe(page('{ "broken": , }', YOAST));
    expect(node).not.toBeNull();
  });

  it('returns null for a page with no recipe markup', () => {
    expect(findJsonLdRecipe('<html><body>just an article</body></html>')).toBeNull();
  });

  it('maps the markup into a draft, text cleaned and steps flattened in order', () => {
    const found = jsonLdToRecipe(findJsonLdRecipe(page(YOAST))!, PAGE);
    expect(found).not.toBeNull();
    const r = found!.recipe;
    expect(r.title).toBe('Menemen & Bread');
    expect(r.ingredients).toEqual(['3 eggs', '2 tomatoes']);
    expect(r.instructions).toEqual(['Chop the tomatoes.', 'Cook with the eggs.']);
    expect(r.prepTimeMinutes).toBe(10);
    expect(r.cookTimeMinutes).toBe(15);
    expect(r.servings).toBe(2);
    expect(r.cuisine).toBe('TURKISH');
    expect(r.category).toBe('BREAKFAST');
    expect(r.tags).toEqual(['eggs', 'tomato', 'quick']);
    expect(r.caloriesPerServing).toBe(320);
    expect(r.nutrition).toEqual({ protein: 18, carbs: 0, fat: 21.5, fiber: 0 });
    expect(r.difficulty).toBe('EASY');
    expect(found!.imageUrl).toBe('https://www.example.com/img/menemen.jpg');
  });

  it('falls back to our catch-all keys for a cuisine and category we do not have', () => {
    const node = { '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], recipeInstructions: 'Do it.', recipeCuisine: 'Martian', recipeCategory: 'Snackish' };
    const r = jsonLdToRecipe(node, PAGE)!.recipe;
    expect(r.cuisine).toBe('OTHER');
    expect(r.category).toBe('MAIN_COURSE');
    expect(r.servings).toBe(4);
  });

  it('splits a single instructions string into one step per line', () => {
    const node = { '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], recipeInstructions: 'Boil.\nDrain.\n\nServe.' };
    expect(jsonLdToRecipe(node, PAGE)!.recipe.instructions).toEqual(['Boil.', 'Drain.', 'Serve.']);
  });

  // A name and a photo is an article ABOUT a recipe; a draft built from it
  // would be empty exactly where it matters.
  it.each([
    ['no ingredients', { '@type': 'Recipe', name: 'X', recipeInstructions: ['Do it.'] }],
    ['no steps', { '@type': 'Recipe', name: 'X', recipeIngredient: ['a'] }],
    ['no name', { '@type': 'Recipe', recipeIngredient: ['a'], recipeInstructions: ['Do it.'] }],
  ])('refuses a node with %s', (_why, node) => {
    expect(jsonLdToRecipe(node, PAGE)).toBeNull();
  });
});

describe('isoDurationMinutes', () => {
  it.each([
    ['PT1H30M', 90],
    ['P0DT0H20M', 20],
    ['PT90S', 2],
    ['P1D', 1440],
    ['pt45m', 45],
  ])('%s → %d', (value, minutes) => {
    expect(isoDurationMinutes(value)).toBe(minutes);
  });

  it.each(['', 'P', 'PT', '20 minutes', 42, null])('rejects %p', (value) => {
    expect(isoDurationMinutes(value)).toBeNull();
  });
});

// The regression: the scanner found positions in a lowercased copy of the
// page and sliced the original with them. 'İ' lowercases to two code units,
// so every capital İ before the script shifted the slice by one and the JSON
// no longer parsed — on nearly every Turkish site, where the menu says
// "İletişim".
it('finds the recipe on a page whose text before it has a capital İ', () => {
  const html = `<nav>İletişim İçerik İndirim</nav>${page(JSON.stringify({ '@type': 'Recipe', name: 'Menemen', recipeIngredient: ['a'], recipeInstructions: ['b'] }))}`;
  expect(findJsonLdRecipe(html)?.['name']).toBe('Menemen');
});

it('matches the script tag whatever its case', () => {
  const html = `<SCRIPT TYPE="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Upper' })}</SCRIPT>`;
  expect(findJsonLdRecipe(html)?.['name']).toBe('Upper');
});

// The symptom: importing yemek.com's trileçe put its cake, caramel and milk
// syrup into one list. The page gives recipeIngredient as a list of lists and
// names the parts only in its visible headings, with markup inside each item.
it('keeps a page’s ingredient sections, named by the heading above each', () => {
  const html = `
    <h3>Trileçenin keki için:</h3><ul><li><span>5 adet</span> büyük boy yumurta</li></ul>
    <h3>Trileçenin karameli için:</h3><ul><li><span>2 yemek kaşığı</span> tereyağı</li></ul>`;
  const node = {
    '@type': 'Recipe',
    name: 'Trileçe',
    recipeIngredient: [['5 adet büyük boy yumurta'], ['2 yemek kaşığı tereyağı']],
    recipeInstructions: ['Pişir.'],
  };
  expect(jsonLdToRecipe(node, 'https://yemek.com/tarif/trilece/', html)!.recipe.ingredients).toEqual([
    '# Trileçenin keki için:',
    '5 adet büyük boy yumurta',
    '# Trileçenin karameli için:',
    '2 yemek kaşığı tereyağı',
  ]);
});

it('stays a flat list when a section cannot be named', () => {
  const node = { '@type': 'Recipe', name: 'X', recipeIngredient: [['a b c'], ['d e f']], recipeInstructions: ['Do.'] };
  expect(jsonLdToRecipe(node, 'https://e.com/', '<p>nothing</p>')!.recipe.ingredients).toEqual(['a b c', 'd e f']);
});
