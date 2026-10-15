import { parseTranslationReply } from '@infrastructure/ai/translation/recipe-translation-prompt';
import type { TranslateRecipeInput } from '@application/recipes/ports/recipe-translator-interface';

const input: TranslateRecipeInput = {
  from: 'tr',
  to: ['en', 'de'],
  text: { name: 'Menemen', ingredients: ['3 yumurta', '2 domates'], instructions: ['Pişir.'], tags: [], mealType: [], tips: [] },
};
const line = (name: string, ingredients: string[]) => ({ name, ingredients, instructions: ['Cook.'], tags: [], mealType: [], tips: [] });

describe('parseTranslationReply', () => {
  it('keeps each well-formed, line-for-line language', () => {
    const r = parseTranslationReply(JSON.stringify({ translations: { en: line('Menemen', ['3 eggs', '2 tomatoes']), de: line('Menemen', ['3 Eier', '2 Tomaten']) } }), input);
    expect(r.ok && Object.keys(r.value)).toEqual(['en', 'de']);
  });

  // Cook mode, timers and the shopping list index lines; a merged line would shift them.
  it('drops a language whose ingredient list changed length', () => {
    const r = parseTranslationReply(JSON.stringify({ translations: { en: line('Menemen', ['3 eggs and 2 tomatoes']), de: line('Menemen', ['3 Eier', '2 Tomaten']) } }), input);
    expect(r.ok && Object.keys(r.value)).toEqual(['de']);
  });

  it('refuses a reply with no usable language', () => {
    expect(parseTranslationReply('not json', input).ok).toBe(false);
    expect(parseTranslationReply(JSON.stringify({ translations: {} }), input).ok).toBe(false);
  });
});
