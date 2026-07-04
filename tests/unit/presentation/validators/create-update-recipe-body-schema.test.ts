import { CreateRecipeBodySchema, UpdateRecipeBodySchema } from '@presentation/validators/recipes.validators';

// Minimal valid payload shared across CreateRecipeBodySchema tests. The app's
// recipe form sends title-cased labels ("Turkish", "Soup", "Medium") for
// cuisine/category/difficulty, not the raw uppercase enum constants
// ("TURKISH", "SOUP", "MEDIUM"). This mirrors a real QA repro: a title-cased
// submission failed Zod validation before ever reaching the use case/DB.
function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    name: { en: 'Tomato Soup' },
    cuisine: 'TURKISH',
    category: 'SOUP',
    difficulty: 'MEDIUM',
    ingredients: { en: ['Tomato', 'Salt'] },
    instructions: { en: ['Boil', 'Serve'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    image: 'https://example.com/image.jpg',
    ...overrides,
  };
}

describe('CreateRecipeBodySchema — cuisine/category/difficulty casing', () => {
  it('accepts title-cased values as sent by the app form ("Turkish"/"Soup"/"Medium")', () => {
    const result = CreateRecipeBodySchema.safeParse(
      validCreateBody({ cuisine: 'Turkish', category: 'Soup', difficulty: 'Medium' }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cuisine).toBe('TURKISH');
    expect(result.data.category).toBe('SOUP');
    expect(result.data.difficulty).toBe('MEDIUM');
  });

  it('accepts lowercase values ("turkish"/"soup"/"medium")', () => {
    const result = CreateRecipeBodySchema.safeParse(
      validCreateBody({ cuisine: 'turkish', category: 'soup', difficulty: 'medium' }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cuisine).toBe('TURKISH');
    expect(result.data.category).toBe('SOUP');
    expect(result.data.difficulty).toBe('MEDIUM');
  });

  it('still accepts already-uppercase values ("TURKISH"/"SOUP"/"MEDIUM") — no regression', () => {
    const result = CreateRecipeBodySchema.safeParse(validCreateBody());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cuisine).toBe('TURKISH');
    expect(result.data.category).toBe('SOUP');
    expect(result.data.difficulty).toBe('MEDIUM');
  });

  it('rejects a value that is not a known enum member regardless of casing', () => {
    const result = CreateRecipeBodySchema.safeParse(validCreateBody({ cuisine: 'Klingon' }));

    expect(result.success).toBe(false);
  });
});

describe('UpdateRecipeBodySchema — cuisine/category/difficulty casing', () => {
  it('accepts title-cased values as sent by the app form ("Turkish"/"Soup"/"Medium")', () => {
    const result = UpdateRecipeBodySchema.safeParse({
      cuisine: 'Turkish',
      category: 'Soup',
      difficulty: 'Medium',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cuisine).toBe('TURKISH');
    expect(result.data.category).toBe('SOUP');
    expect(result.data.difficulty).toBe('MEDIUM');
  });

  it('still accepts already-uppercase values — no regression', () => {
    const result = UpdateRecipeBodySchema.safeParse({
      cuisine: 'TURKISH',
      category: 'SOUP',
      difficulty: 'MEDIUM',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cuisine).toBe('TURKISH');
    expect(result.data.category).toBe('SOUP');
    expect(result.data.difficulty).toBe('MEDIUM');
  });

  it('rejects an unknown enum value regardless of casing', () => {
    const result = UpdateRecipeBodySchema.safeParse({ category: 'NotARealCategory' });

    expect(result.success).toBe(false);
  });
});
