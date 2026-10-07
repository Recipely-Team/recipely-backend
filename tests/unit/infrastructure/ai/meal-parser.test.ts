import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure } from '@core/failure';
import { ModelMealParser } from '@infrastructure/ai/meal/model-meal-parser';
import { readMealParseResponse } from '@infrastructure/ai/meal/read-meal-parse-response';
import type { MealModelInterface } from '@infrastructure/ai/meal/meal-model-interface';
import { MealParseLimits } from '@application/diary/meal-parse-limits';

const ITEM = { label: 'Ekmek', searchTerm: 'ekmek', grams: 60, kcal: 160, protein: 5, carbs: 30, fat: 1.5, fiber: 2, confidence: 0.8 };
const ANSWER = JSON.stringify({ items: [ITEM] });

function model(provider: string, ...answers: string[]): MealModelInterface & { complete: jest.Mock } {
  const complete = jest.fn();
  for (const a of answers) complete.mockResolvedValueOnce(a === 'DOWN' ? fail(new ServiceUnavailableFailure('errors.meal_parse.unavailable')) : ok(a));
  return { provider, canRun: () => true, complete };
}

describe('readMealParseResponse', () => {
  it('reads a fenced JSON answer into items with a portion estimate', () => {
    expect(readMealParseResponse('```json\n' + ANSWER + '\n```')).toEqual(ok([
      { label: 'Ekmek', searchTerm: 'ekmek', grams: 60, confidence: 0.8, estimate: { kcal: 160, protein: 5, carbs: 30, fat: 1.5, fiber: 2 } },
    ]));
  });

  it.each(['not json at all', '{"foods":[]}', '{"items":"bread"}'])('treats a garbled answer as a provider failure: %s', (raw) => {
    const result = readMealParseResponse(raw);
    expect(!result.ok && result.failure.messageKey).toBe('errors.meal_parse.unavailable');
  });

  it('drops a malformed item and keeps the rest', () => {
    const result = readMealParseResponse(JSON.stringify({ items: [{ label: '' }, { ...ITEM, grams: -5 }, ITEM] }));
    expect(result.ok && result.value).toHaveLength(1);
  });

  it('clamps portions, nutrients and confidence, and caps the item count', () => {
    const wild = { ...ITEM, grams: 40_000, kcal: 1e9, confidence: 7 };
    const result = readMealParseResponse(JSON.stringify({ items: Array.from({ length: 30 }, () => wild) }));
    if (!result.ok) throw new Error('expected items');
    expect(result.value).toHaveLength(MealParseLimits.maxItems);
    expect(result.value[0]).toMatchObject({ grams: MealParseLimits.maxGrams, confidence: 1, estimate: { kcal: 5000 } });
  });
});

describe('ModelMealParser', () => {
  it('asks Gemini first and fences the user text as data', async () => {
    const gemini = model('gemini', ANSWER);
    const groq = model('groq', ANSWER);
    const result = await new ModelMealParser([gemini, groq]).parse({ input: { text: 'menemen ve 2 dilim ekmek' }, locale: 'tr' });
    expect(result.ok).toBe(true);
    expect(groq.complete).not.toHaveBeenCalled();
    const [prompt, photo] = gemini.complete.mock.calls[0] as [string, unknown];
    expect(prompt).toContain('<meal>\nmenemen ve 2 dilim ekmek\n</meal>');
    expect(photo).toBeUndefined();
  });

  it('moves to the next provider on a garbled answer or an outage', async () => {
    const gemini = model('gemini', 'sorry, I cannot');
    const groq = model('groq', 'DOWN');
    const third = model('third', ANSWER);
    const photo = { image: Buffer.from('jpg'), mimeType: 'image/jpeg' };
    const result = await new ModelMealParser([gemini, groq, third]).parse({ input: { photo }, locale: 'en' });
    expect(result.ok && result.value).toHaveLength(1);
    expect(third.complete).toHaveBeenCalledWith(expect.not.stringContaining('<meal>'), photo);
  });

  it('answers unavailable when every provider fails, and not-configured with none', async () => {
    const all = await new ModelMealParser([model('gemini', 'DOWN'), model('groq', '{}')]).parse({ input: { text: 'x' }, locale: 'en' });
    expect(!all.ok && all.failure.messageKey).toBe('errors.meal_parse.unavailable');
    const none = await new ModelMealParser([{ provider: 'gemini', canRun: () => false, complete: jest.fn() }]).parse({ input: { text: 'x' }, locale: 'en' });
    expect(!none.ok && none.failure.messageKey).toBe('errors.ai.provider_not_configured');
  });
});
