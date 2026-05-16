import { Recipe, type RecipeProps } from '@domain/recipes/recipe';

function baseProps(overrides: Partial<RecipeProps> = {}): RecipeProps {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'recipe-1',
    name: { en: 'Pasta' },
    cuisine: { en: 'Italian' },
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] },
    instructions: { en: ['boil', 'serve'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/pasta.jpg',
    rating: 4.5,
    tags: { en: ['quick'] },
    mealType: { en: ['dinner'] },
    media: [],
    ownerId: 'user-1',
    isPublished: true,
    moderationStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Recipe.create', () => {
  it('returns ok with a Recipe when all props are valid', () => {
    const result = Recipe.create(baseProps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(Recipe);
    expect(result.value.id).toBe('recipe-1');
  });

  it('returns ValidationFailure when id is empty', () => {
    const result = Recipe.create(baseProps({ id: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.id_required');
  });

  it('returns ValidationFailure when name has no keys', () => {
    const result = Recipe.create(baseProps({ name: {} }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.name_required');
  });

  it('returns ValidationFailure when all name values are blank', () => {
    const result = Recipe.create(baseProps({ name: { en: '   ' } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.name_required');
  });

  it('returns ValidationFailure when ownerId is blank', () => {
    const result = Recipe.create(baseProps({ ownerId: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.owner_required');
  });

  it('returns ValidationFailure when prepTimeMinutes is negative', () => {
    const result = Recipe.create(baseProps({ prepTimeMinutes: -1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.prep_time_invalid');
  });

  it('returns ValidationFailure when cookTimeMinutes is negative', () => {
    const result = Recipe.create(baseProps({ cookTimeMinutes: -5 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.prep_time_invalid');
  });

  it('returns ValidationFailure when rating exceeds 5', () => {
    const result = Recipe.create(baseProps({ rating: 5.1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.rating_invalid');
  });

  it('returns ValidationFailure when rating is negative', () => {
    const result = Recipe.create(baseProps({ rating: -0.1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.rating_invalid');
  });

  it('returns ValidationFailure when servings is less than 1', () => {
    const result = Recipe.create(baseProps({ servings: 0 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.servings_invalid');
  });

  it('returns ValidationFailure when caloriesPerServing is negative', () => {
    const result = Recipe.create(baseProps({ caloriesPerServing: -1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.calories_invalid');
  });

  it('stores moderationStatus as approved on the entity', () => {
    const result = Recipe.create(baseProps({ moderationStatus: 'approved' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('approved');
  });

  it('stores moderationStatus as rejected on the entity', () => {
    const result = Recipe.create(baseProps({ moderationStatus: 'rejected', isPublished: false }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('rejected');
    expect(result.value.isPublished).toBe(false);
  });

  it('stores moderationStatus as pending on the entity', () => {
    const result = Recipe.create(baseProps({ moderationStatus: 'pending', isPublished: false }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
    expect(result.value.isPublished).toBe(false);
  });
});

describe('Recipe.localize', () => {
  it('returns localized fields including moderationStatus for the requested locale', () => {
    const result = Recipe.create(baseProps({
      name: { en: 'Pasta', tr: 'Makarna' },
      cuisine: { en: 'Italian', tr: 'İtalyan' },
      ingredients: { en: ['pasta'], tr: ['makarna'] },
      instructions: { en: ['boil'], tr: ['kaynat'] },
      tags: { en: ['quick'], tr: ['hızlı'] },
      mealType: { en: ['dinner'], tr: ['akşam yemeği'] },
      moderationStatus: 'pending',
      isPublished: false,
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const localized = result.value.localize('tr');
    expect(localized.name).toBe('Makarna');
    expect(localized.cuisine).toBe('İtalyan');
    expect(localized.moderationStatus).toBe('pending');
    expect(localized.isPublished).toBe(false);
  });

  it('falls back to English when the requested locale is not present', () => {
    const result = Recipe.create(baseProps({ name: { en: 'Pasta' } }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const localized = result.value.localize('fr');
    expect(localized.name).toBe('Pasta');
  });

  it('includes moderationStatus approved in localized output', () => {
    const result = Recipe.create(baseProps({ moderationStatus: 'approved', isPublished: true }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const localized = result.value.localize('en');
    expect(localized.moderationStatus).toBe('approved');
    expect(localized.isPublished).toBe(true);
  });
});
