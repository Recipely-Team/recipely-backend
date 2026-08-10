import { isIngredientGroupHeading } from '@domain/recipes/ingredient-group';

/**
 * A recipe of separate components names its parts with `#` heading lines inside
 * the ordinary ingredients array. Nutrition is the load-bearing case: a heading
 * has no quantity to estimate from, and handing one to the model invites it to
 * treat "# Syrup" as an ingredient with an implied amount.
 */

describe('isIngredientGroupHeading', () => {
  it('recognises a heading', () => {
    expect(isIngredientGroupHeading('# Şerbet')).toBe(true);
  });

  it('recognises one written without a space', () => {
    expect(isIngredientGroupHeading('#Syrup')).toBe(true);
  });

  it('tolerates leading whitespace', () => {
    expect(isIngredientGroupHeading('  # Syrup')).toBe(true);
  });

  it('leaves a real ingredient alone', () => {
    expect(isIngredientGroupHeading('2 cups flour')).toBe(false);
  });

  it('does not fire on a # inside the text', () => {
    expect(isIngredientGroupHeading('Flour #1 grade')).toBe(false);
  });
});

describe('nutrition input', () => {
  // Mirrors the filter the calculator applies before building its prompt.
  const measurable = (lines: string[]): string[] => lines.filter((l) => !isIngredientGroupHeading(l));

  it('drops the headings and keeps every quantity', () => {
    expect(
      measurable(['# Cake', '3 eggs', '1 cup flour', '# Syrup', '2 cups sugar', '1 cup water']),
    ).toEqual(['3 eggs', '1 cup flour', '2 cups sugar', '1 cup water']);
  });

  it('leaves an ungrouped recipe untouched', () => {
    expect(measurable(['3 eggs', '1 cup flour'])).toEqual(['3 eggs', '1 cup flour']);
  });
});
