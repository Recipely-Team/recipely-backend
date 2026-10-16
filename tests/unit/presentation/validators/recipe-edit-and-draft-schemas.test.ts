import { CreateRecipeBodySchema, EditRecipeBodySchema } from '@presentation/validators/recipes.validators';
import { UpsertDraftBodySchema } from '@presentation/validators/drafts.validators';

describe('EditRecipeBodySchema (PATCH /recipes/:id)', () => {
  it('accepts a partial edit, with the create schema\'s normalisation', () => {
    const parsed = EditRecipeBodySchema.parse({ cuisine: 'italian', ingredients: { en: ['  pasta '] } });
    expect(parsed).toEqual({ cuisine: 'ITALIAN', ingredients: { en: ['pasta'] } });
  });

  it('applies the create schema\'s field rules', () => {
    expect(EditRecipeBodySchema.safeParse({ servings: 0 }).success).toBe(false);
    expect(EditRecipeBodySchema.safeParse({ name: { en: '   ' } }).success).toBe(false);
  });

  it('refuses an empty edit with a catalogue key', () => {
    const parsed = EditRecipeBodySchema.safeParse({});
    expect(!parsed.success && parsed.error.issues[0]?.message).toBe('errors.validation.nothing_to_edit');
  });

  it('ignores fields an edit may not touch', () => {
    const parsed = EditRecipeBodySchema.parse({ servings: 2, image: 'https://x/y.jpg', visibility: 'public', isPublished: true });
    expect(parsed).toEqual({ servings: 2 });
  });
});

/**
 * The symptom: opening an imported draft once was enough to lose its cover,
 * category, tags, tips and nutrition. The app sent them back on autosave and
 * the schema stripped them.
 */
describe('UpsertDraftBodySchema keeps what an import filled in', () => {
  it('passes image, taxonomy, tips and nutrition through', () => {
    const snapshot = {
      name: 'Pasta',
      image: 'https://api.test/uploads/c.jpg',
      category: 'MAIN_COURSE',
      tags: ['quick'],
      mealType: ['dinner'],
      tips: ['salt the water'],
      caloriesPerServing: 420,
      nutrition: { protein: 12 },
    };
    const parsed = UpsertDraftBodySchema.parse({ id: '8d2f0a57-2f4b-4c65-9d7a-1b1c4f5e6a7b', snapshot });
    expect(parsed.snapshot).toEqual(snapshot);
  });

  it('still strips the server-owned fields a client might send', () => {
    const parsed = UpsertDraftBodySchema.parse({
      id: '8d2f0a57-2f4b-4c65-9d7a-1b1c4f5e6a7b',
      snapshot: { name: 'Pasta', sourcePlatform: 'WEB', importedIngredientsHash: 'x', origin: 'USER' },
    });
    expect(parsed.snapshot).toEqual({ name: 'Pasta' });
  });
});

/** A client that reads `nutrition.servingWeightGrams` may send it back unchanged. */
describe('nutrition.servingWeightGrams in request bodies', () => {
  const nutrition = (servingWeightGrams: unknown) => ({ nutrition: { protein: 10, servingWeightGrams } });

  it('is kept by the edit, draft and create schemas', () => {
    expect(EditRecipeBodySchema.parse(nutrition(300)).nutrition?.servingWeightGrams).toBe(300);
    expect(UpsertDraftBodySchema.shape.snapshot.parse({ name: 'Pasta', ...nutrition(300) }).nutrition?.servingWeightGrams).toBe(300);
    expect(CreateRecipeBodySchema.shape.nutrition.parse(nutrition(300).nutrition)?.servingWeightGrams).toBe(300);
  });

  it.each([19, 3001, 250.5])('is refused outside a whole 20-3000 g (%p)', (grams) => {
    expect(EditRecipeBodySchema.safeParse(nutrition(grams)).success).toBe(false);
    expect(CreateRecipeBodySchema.shape.nutrition.safeParse(nutrition(grams).nutrition).success).toBe(false);
  });
});

// The import draft's "Check" chips are kept by the text of the lines still
// unedited; stripping the field would bring every chip back on resume.
describe('UpsertDraftBodySchema keeps the unedited guessed lines', () => {
  it('passes guessedLines through', () => {
    const snapshot = UpsertDraftBodySchema.shape.snapshot.parse({ name: 'Menemen', guessedLines: ['2 domates'] });
    expect(snapshot.guessedLines).toEqual(['2 domates']);
  });
});
