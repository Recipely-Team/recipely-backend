import { translationGapOf } from '@domain/recipes/localization/translation-gap-of';
import { RECIPE_LOCALES } from '@domain/recipes/localization/recipe-locales';
import type { RecipeProps } from '@domain/recipes/recipe-props';

/**
 * A Turkish import read by a Korean user showed Turkish: a recipe was stored
 * only in its importer's language. Every app language is now filled in, and
 * this is the rule for what is missing and what to translate from.
 */
const props = (name: Record<string, string>, extra: Partial<RecipeProps> = {}): RecipeProps =>
  ({
    name,
    ingredients: Object.fromEntries(Object.keys(name).map((l) => [l, [`${l} egg`]])),
    instructions: Object.fromEntries(Object.keys(name).map((l) => [l, [`${l} cook`]])),
    tags: {},
    mealType: {},
    ...extra,
  }) as unknown as RecipeProps;

describe('translationGapOf', () => {
  it('lists every app language a Turkish-only import lacks, translating from Turkish', () => {
    const gap = translationGapOf(props({ tr: 'Menemen' }));
    expect(gap?.from).toBe('tr');
    expect(gap?.missing).toEqual(RECIPE_LOCALES.filter((l) => l !== 'tr'));
    expect(gap?.text.ingredients).toEqual(['tr egg']);
  });

  it('translates from English whenever the recipe has it', () => {
    expect(translationGapOf(props({ tr: 'Menemen', en: 'Menemen' }))?.from).toBe('en');
  });

  it('has nothing to do once every language has a name', () => {
    expect(translationGapOf(props(Object.fromEntries(RECIPE_LOCALES.map((l) => [l, 'x']))))).toBeNull();
  });

  it('counts a blank name as missing', () => {
    expect(translationGapOf(props({ en: 'Soup', de: '  ' }))?.missing).toContain('de');
  });
});
