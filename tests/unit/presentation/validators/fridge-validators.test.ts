import { FridgeIdeasBodySchema, FridgeScanFieldsSchema } from '@presentation/validators/fridge/fridge.validators';

const firstMessage = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.success ? null : result.error?.issues[0]?.message;

describe('fridge validators', () => {
  it('accepts a minimal request and fills the defaults', () => {
    const parsed = FridgeIdeasBodySchema.safeParse({ ingredients: ['egg'] });
    expect(parsed.success && parsed.data).toEqual({ ingredients: ['egg'], diet: 'none', exclude: [] });
    expect(FridgeIdeasBodySchema.safeParse({ ingredients: ['egg'], maxMinutes: 30, diet: 'highProtein', servings: 12, exclude: ['x'], locale: 'pt-BR' }).success).toBe(true);
  });

  it('answers every refusal with a catalogue key', () => {
    expect(firstMessage(FridgeIdeasBodySchema.safeParse({}))).toBe('errors.fridge.ingredients_required');
    expect(firstMessage(FridgeIdeasBodySchema.safeParse({ ingredients: [] }))).toBe('errors.fridge.ingredients_required');
    expect(firstMessage(FridgeIdeasBodySchema.safeParse({ ingredients: ['x'.repeat(41)] }))).toBe('errors.fridge.ingredients_invalid');
    expect(firstMessage(FridgeIdeasBodySchema.safeParse({ ingredients: Array(41).fill('egg') }))).toBe('errors.fridge.ingredients_invalid');
    expect(firstMessage(FridgeIdeasBodySchema.safeParse({ ingredients: ['egg'], maxMinutes: 45 }))).toBe('errors.fridge.options_invalid');
    expect(firstMessage(FridgeIdeasBodySchema.safeParse({ ingredients: ['egg'], diet: 'keto' }))).toBe('errors.fridge.options_invalid');
    expect(firstMessage(FridgeIdeasBodySchema.safeParse({ ingredients: ['egg'], servings: 13 }))).toBe('errors.fridge.options_invalid');
    expect(firstMessage(FridgeIdeasBodySchema.safeParse({ ingredients: ['egg'], exclude: Array(13).fill('a') }))).toBe('errors.fridge.options_invalid');
    expect(firstMessage(FridgeScanFieldsSchema.safeParse({ locale: 'english' }))).toBe('errors.fridge.options_invalid');
  });
});
