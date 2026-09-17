/**
 * The symptom: a cook's sütlaç had been written by Gemini, and every question
 * and edit they typed underneath it was answered by Groq — in dev and in
 * production both, for the whole life of the feature.
 *
 * Nothing was misconfigured. The generator grew a provider chain and this seat
 * never did: it stayed single-provider, chosen by `AI_PROVIDER`, which defaults
 * to `groq`. Worse, it read the SINGULAR `GEMINI_API_KEY`, which is empty on
 * production — so `AI_PROVIDER=gemini` would not have moved the refinement to
 * Gemini, it would have disabled /refine entirely.
 */

import { createRecipeRefiner } from '@infrastructure/ai/recipe-refiner-factory';
import { FallbackRecipeRefiner } from '@infrastructure/ai/fallback-recipe-refiner';
import { GeminiRecipeRefiner } from '@infrastructure/ai/gemini/gemini-recipe-refiner';
import { GroqRecipeRefiner } from '@infrastructure/ai/groq/groq-recipe-refiner';
import { DisabledRecipeRefiner } from '@infrastructure/ai/disabled/disabled-recipe-refiner';
import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';

const build = (gemini: string[], groq: string[]) =>
  createRecipeRefiner({
    geminiKeys: new ApiKeyPool(gemini),
    groqKeys: new ApiKeyPool(groq),
    geminiModel: 'gemini-flash-latest',
    groqModel: 'openai/gpt-oss-120b',
  });

/** The chain holds its refiners privately; this is the only way to read the order. */
const seatsOf = (refiner: unknown): string[] =>
  ((refiner as { refiners: readonly object[] }).refiners ?? []).map((seat) => seat.constructor.name);

describe('createRecipeRefiner', () => {
  it('asks Gemini first and leaves Groq last', () => {
    const refiner = build(['g-1'], ['q-1']);

    expect(refiner).toBeInstanceOf(FallbackRecipeRefiner);
    expect(seatsOf(refiner)).toEqual(['GeminiRecipeRefiner', 'GroqRecipeRefiner']);
  });

  // The reason `AI_PROVIDER=gemini` would not have been a fix: production's key
  // is in the plural var, and this factory only ever read the singular one.
  it('seats Gemini from the pool production actually deploys its key in', () => {
    expect(seatsOf(build(['from-GEMINI_API_KEYS'], ['q-1']))[0]).toBe('GeminiRecipeRefiner');
  });

  it('uses Groq alone when that is the only key there is', () => {
    expect(build([], ['q-1'])).toBeInstanceOf(GroqRecipeRefiner);
  });

  it('uses Gemini alone when that is the only key there is', () => {
    expect(build(['g-1'], [])).toBeInstanceOf(GeminiRecipeRefiner);
  });

  // A deployment with no AI keys still boots; /refine reports that it is not
  // configured rather than the process refusing to start.
  it('disables refining rather than failing to boot when there are no keys', () => {
    expect(build([], [])).toBeInstanceOf(DisabledRecipeRefiner);
  });
});
