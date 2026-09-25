/**
 * The app shows nutrition per 100 g, which needs the cooked weight of one
 * serving. The calculator asks for it and keeps it only when it is plausible;
 * an implausible weight is dropped without costing the macros it came with.
 */
jest.mock('groq-sdk', () => {
  const mockCreate = jest.fn();
  const MockGroq = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  (MockGroq as unknown as Record<string, unknown>).__mockCreate = mockCreate;
  return { default: MockGroq, __esModule: true };
});

import Groq from 'groq-sdk';
import { GroqNutritionCalculator } from '@infrastructure/ai/groq/groq-nutrition-calculator';

const mockCreate = (Groq as unknown as Record<string, unknown>).__mockCreate as jest.Mock;

const MACROS = { caloriesPerServing: 480, protein: 20, carbs: 55, fat: 18, fiber: 4 };

const reply = (body: Record<string, unknown>): void => {
  mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(body) } }] });
};

const calculate = () =>
  new GroqNutritionCalculator({ apiKey: 'k', model: 'm' }).calculate({
    ingredients: ['200 g pasta', '# Sauce', '2 tomatoes'],
    instructions: ['Boil the pasta.', 'Simmer the sauce.'],
    servings: 2,
  });

beforeEach(() => mockCreate.mockReset());

describe('GroqNutritionCalculator — serving weight', () => {
  it('asks for the cooked weight of one serving, and sends the method to estimate it from', async () => {
    reply({ ...MACROS, servingWeightGrams: 320 });
    await calculate();

    const [request] = mockCreate.mock.calls[0] as [{ messages: Array<{ role: string; content: string }> }];
    const system = request.messages.find((m) => m.role === 'system')!.content;
    const user = request.messages.find((m) => m.role === 'user')!.content;
    expect(system).toContain('"servingWeightGrams": integer (20-3000');
    expect(system).toMatch(/COOKED weight of one serving/);
    expect(user).toContain('Method:\nBoil the pasta.\nSimmer the sauce.');
    expect(user).not.toContain('# Sauce');
  });

  it.each([20, 320, 3000])('keeps a plausible weight (%p g)', async (grams) => {
    reply({ ...MACROS, servingWeightGrams: grams });
    const result = await calculate();
    expect(result.ok && result.value).toEqual({ ...MACROS, servingWeightGrams: grams });
  });

  it.each([19, 3001, 250.5, '300', null, -5])('drops an implausible weight (%p) and keeps the macros', async (grams) => {
    reply({ ...MACROS, servingWeightGrams: grams });
    const result = await calculate();
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(MACROS);
    expect(result.ok && 'servingWeightGrams' in result.value).toBe(false);
  });

  it('still answers when the model leaves the weight out', async () => {
    reply(MACROS);
    const result = await calculate();
    expect(result.ok && result.value).toEqual(MACROS);
  });
});
