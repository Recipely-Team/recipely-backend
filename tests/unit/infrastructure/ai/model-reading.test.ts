import { modelReadingOf, withSourceText } from '@infrastructure/ai/import/model-reading';
import type { ParsedImportRecipeVision } from '@infrastructure/ai/recipe-prompt';

const parsed = (over: Partial<ParsedImportRecipeVision>): ParsedImportRecipeVision =>
  ({ ingredients: ['3 eggs', '2 tomatoes', 'salt'], instructions: ['Chop.', 'Cook.'], suggested: false, guessedIngredients: [], guessedSteps: [], ...over }) as ParsedImportRecipeVision;

describe('modelReadingOf', () => {
  it('flags only the lines the model says it filled in, inside the lists', () => {
    expect(modelReadingOf(parsed({ guessedIngredients: [1, 1, 9], guessedSteps: [-1, 0] }))).toEqual({
      suggested: false,
      guessedIngredients: [1],
      guessedSteps: [0],
    });
  });

  it('flags every line of a suggested recipe: none of it came from the post', () => {
    const r = modelReadingOf(parsed({ suggested: true }));
    expect(r.guessedIngredients).toEqual([0, 1, 2]);
    expect(r.guessedSteps).toEqual([0, 1]);
  });
});

describe('withSourceText', () => {
  it('joins what the model was shown and caps it', () => {
    const r = withSourceText({ suggested: false, guessedIngredients: [], guessedSteps: [] }, ['caption', '  ', 'x'.repeat(5000)]);
    expect(r?.sourceText?.startsWith('caption\n\nxxx')).toBe(true);
    expect(r?.sourceText?.length).toBe(4000);
  });
});
