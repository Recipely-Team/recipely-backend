import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recipe creation stopped working in production while Gemini was degraded, and
 * the fallback chain did not save it: neither seat had a timeout, so the slow
 * one held the request for 91 seconds, the app gave up at 90, and Groq — which
 * would have answered — never got a turn.
 *
 * A fallback that only runs after the caller has left is not a fallback. What
 * has to hold is a relationship between three numbers, so that is what this
 * pins: both seats together must fit inside the app's wait.
 */

const read = (relative: string): string =>
  readFileSync(join(__dirname, '../../../../src', relative), 'utf8');

const timeoutIn = (source: string): number =>
  Number(/const REQUEST_TIMEOUT_MS = ([\d_]+);/.exec(source)?.[1]?.replace(/_/g, ''));

/** `AI_REQUEST_TIMEOUT_MS` in the app's `infrastructure/constants/api/api-timeouts.ts`. */
const CLIENT_TIMEOUT_MS = 90_000;

describe('the generation chain fits inside the wait', () => {
  const gemini = timeoutIn(read('infrastructure/ai/gemini/gemini-recipe-generator.ts'));
  const groq = timeoutIn(read('infrastructure/ai/groq/groq-recipe-generator.ts'));

  it('bounds both seats', () => {
    expect(gemini).toBeGreaterThan(0);
    expect(groq).toBeGreaterThan(0);
  });

  it('leaves the second seat a turn before the app gives up', () => {
    expect(gemini + groq).toBeLessThan(CLIENT_TIMEOUT_MS);
  });

  // Long enough to be a real answer, not just short enough to fail fast.
  it('gives each seat room for a generation', () => {
    expect(gemini).toBeGreaterThanOrEqual(20_000);
    expect(groq).toBeGreaterThanOrEqual(20_000);
  });
});
