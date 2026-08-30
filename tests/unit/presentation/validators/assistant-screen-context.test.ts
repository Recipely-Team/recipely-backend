import { AssistantMessageBodySchema } from '@presentation/validators/assistant.validators';

/**
 * Typing to the assistant from the recipe feed was answered with a 400.
 *
 * The screen line names what the user can see — up to eight recipes, numbered,
 * so "the second one" has a referent — and the validator capped it at 200
 * characters. Eight real recipe names from production measure 365 before a
 * screen name, a filter or a draft's ingredient list is added, so the cap was
 * never reachable on the screen the app opens on. Nothing failed loudly: the
 * request was refused before the model saw it, and the user got "the request
 * did not arrive".
 */

/** Eight names of an ordinary length, as `recipeRoster` numbers them. */
const feedLine = (): string => {
  const names = [
    'Spaghetti Aglio e Olio',
    'Quick Chicken and Vegetable Stir-Fry with Rice',
    'Mercimek Çorbası',
    'Fırında Sebzeli Tavuk',
    'Creamy Mushroom Risotto',
    'Zeytinyağlı Enginar',
    'One-Pan Lemon Garlic Salmon',
    'Karnıyarık',
  ];
  return `screen=/recipes; recipes=${names.map((n, i) => `${i + 1}) ${n}`).join(' ')}`;
};

const body = (screenContext: string) => ({
  message: 'bu sayfada ne var',
  languageCode: 'tr',
  screenContext,
});

describe('the screen line the app sends', () => {
  it('accepts a real feed, which is longer than the old cap', () => {
    const line = feedLine();

    // The bug in one number: this is what the feed actually produces.
    expect(line.length).toBeGreaterThan(200);
    expect(AssistantMessageBodySchema.safeParse(body(line)).success).toBe(true);
  });

  it('accepts a draft being edited, ingredients and all', () => {
    const line =
      'screen=/create-recipe; draft=Fırında Sebzeli Tavuk; ingredients=1) 2 yemek kaşığı zeytinyağı ' +
      '2) 1 kg tavuk but 3) 2 adet patates 4) 1 adet kabak 5) 2 diş sarımsak 6) 1 tatlı kaşığı tuz ' +
      '7) yarım demet maydanoz 8) 1 su bardağı su; steps=6';

    expect(AssistantMessageBodySchema.safeParse(body(line)).success).toBe(true);
  });

  // Bounded is the point, not unlimited: recipe names are written by users and
  // this text travels into a request we sign with our own key.
  it('still refuses a line no screen could have produced', () => {
    expect(AssistantMessageBodySchema.safeParse(body('x'.repeat(2_000))).success).toBe(false);
  });
});
