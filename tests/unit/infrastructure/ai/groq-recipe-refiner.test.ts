/**
 * The symptom: "Tarifi düzenle" on the web app answered
 * `503 Service Unavailable`, repeatedly, while `/health` returned 200 and the
 * container had been healthy for hours. The service was never down — the model
 * failed to produce valid JSON for that input, and every upstream exception was
 * being reported as an outage.
 *
 * Groq raises the same 400 in two shapes, both seen in dev inside one hour:
 * `failed_generation: ""` (the reasoning burned the whole completion budget and
 * emitted nothing) and "max completion tokens reached before generating a valid
 * document". Neither is something waiting fixes.
 */

import { GroqRecipeRefiner } from '@infrastructure/ai/groq/groq-recipe-refiner';
import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';

const create = jest.fn();

jest.mock('groq-sdk', () => ({
  __esModule: true,
  default: class {
    chat = { completions: { create: (...args: unknown[]) => create(...args) } };
  },
}));

/** The shape the SDK throws: a status plus the whole response body in `message`. */
const groqError = (status: number, message: string): Error =>
  Object.assign(new Error(message), { status });

const JSON_VALIDATE_FAILED =
  '400 {"error":{"message":"Failed to generate JSON. Please adjust your prompt.",' +
  '"code":"json_validate_failed","failed_generation":"max completion tokens reached ' +
  'before generating a valid document"}}';

const refiner = new GroqRecipeRefiner({
  keys: new ApiKeyPool(['k']),
  model: 'openai/gpt-oss-120b',
});

const refine = () =>
  refiner.refine({
    currentRecipe: { name: 'Karnıyarık' },
    instruction: 'Vejetaryen yap',
    locale: 'tr',
  } as Parameters<GroqRecipeRefiner['refine']>[0]);

beforeEach(() => {
  create.mockReset();
});

describe('GroqRecipeRefiner', () => {
  // The bug: this arm returned ServiceUnavailable, so the app told the user the
  // service was down about a request only they could change.
  it('reports a model that could not produce JSON as unprocessable, not an outage', async () => {
    create.mockRejectedValue(groqError(400, JSON_VALIDATE_FAILED));

    const result = await refine();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
  });

  // A real outage must still read as one — the mapping above is narrow on
  // purpose, or a dead upstream would start telling users to reword.
  it('still reports a genuine upstream failure as unavailable', async () => {
    create.mockRejectedValue(groqError(500, 'upstream is on fire'));

    const result = await refine();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('service_unavailable');
  });

  // Cutting the thinking is what leaves budget for the answer. Measured on this
  // account against a 6.3 KB recipe: 1701 completion tokens unset vs 1033 at
  // 'low'. NOT max_completion_tokens — Groq reserves that against the 8000 TPM
  // ceiling, which trades this failure for a rate-limit one.
  it('asks the reasoning model to keep its thinking short', async () => {
    create.mockRejectedValue(groqError(500, 'x'));

    await refine();

    expect(create.mock.calls[0][0]).toMatchObject({ reasoning_effort: 'low' });
  });
});
