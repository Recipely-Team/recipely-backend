import { EditRecipeBodySchema } from '@presentation/validators/recipes.validators';
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
