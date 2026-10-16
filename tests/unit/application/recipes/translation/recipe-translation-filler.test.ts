import { ok, fail } from '@core/result/result';
import { ServiceUnavailableFailure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeText } from '@domain/recipes/localization/recipe-text';
import type { RecipeTranslationRepositoryInterface } from '@domain/recipes/localization/recipe-translation-repository-interface';
import type { RecipeTranslatorInterface, TranslateRecipeInput } from '@application/recipes/ports/recipe-translator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { RecipeTranslationFiller } from '@application/recipes/translation/recipe-translation-filler';
import { RECIPE_LOCALES } from '@domain/recipes/localization/recipe-locales';

const recipe = { id: 'r1', toRaw: () => ({ name: { tr: 'Menemen' }, ingredients: { tr: ['yumurta'] }, instructions: { tr: ['pişir'] }, tags: {}, mealType: {} }) } as unknown as Recipe;
const textIn = (locale: string): RecipeText => ({ name: `${locale} name`, ingredients: ['x'], instructions: ['y'], tags: [], mealType: [], tips: [] });

const setup = (failFor: (input: TranslateRecipeInput) => boolean = () => false) => {
  const setTranslations = jest.fn(async () => ok(undefined));
  const repo = { setTranslations, listNeedingTranslation: jest.fn() } as unknown as RecipeTranslationRepositoryInterface;
  const translate = jest.fn(async (input: TranslateRecipeInput) =>
    failFor(input) ? fail(new ServiceUnavailableFailure('errors.ai.upstream_failed')) : ok(Object.fromEntries(input.to.map((l) => [l, textIn(l)]))),
  );
  const logger = { warn: jest.fn(), info: jest.fn() } as unknown as LoggerInterface;
  return { filler: new RecipeTranslationFiller(repo, { translate } as RecipeTranslatorInterface, logger), translate, setTranslations };
};

describe('RecipeTranslationFiller', () => {
  it('writes all thirteen missing languages, three per model call, from the recipe’s own language', async () => {
    const { filler, translate, setTranslations } = setup();
    await expect(filler.fill(recipe)).resolves.toBe(RECIPE_LOCALES.length - 1);
    expect(translate).toHaveBeenCalledTimes(5);
    for (const [input] of translate.mock.calls) {
      expect(input.from).toBe('tr');
      expect(input.to.length).toBeLessThanOrEqual(3);
    }
    expect(setTranslations).toHaveBeenCalledTimes(5);
  });

  it('keeps the languages that worked when one call fails', async () => {
    const { filler, setTranslations } = setup((input) => input.to.includes('de'));
    const added = await filler.fill(recipe);
    expect(added).toBe(RECIPE_LOCALES.length - 1 - 3);
    expect(setTranslations).toHaveBeenCalledTimes(4);
  });
});
