/**
 * What /generate does when a provider cannot answer.
 *
 * The chain exists because asking one provider and stopping made a spent quota
 * an outage. Every test here is about the decision to move on — or, just as
 * important, the decision not to.
 */

jest.mock('@infrastructure/logger/pino-logger', () => ({
  pinoInstance: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { ok, fail } from '@core/result/result';
import {
  ConflictFailure,
  ServiceUnavailableFailure,
  UnprocessableFailure,
} from '@core/failure';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';
import { FallbackRecipeGenerator } from '@infrastructure/ai/fallback-recipe-generator';
import { createRecipeGenerator } from '@infrastructure/ai/recipe-generator-factory';
import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { GeminiRecipeGenerator } from '@infrastructure/ai/gemini/gemini-recipe-generator';
import { GroqRecipeGenerator } from '@infrastructure/ai/groq/groq-recipe-generator';
import { DisabledRecipeGenerator } from '@infrastructure/ai/disabled/disabled-recipe-generator';
import type {
  GenerateRecipeResult,
  IRecipeGenerator,
} from '@application/ai/ports/i-recipe-generator';

const REQUEST = { userPrompt: 'mercimek çorbası', locale: 'tr' };

const recipeFrom = (provider: string): GenerateRecipeResult =>
  ({ recipe: { title: 'x' }, modelUsed: 'm', provider }) as unknown as GenerateRecipeResult;

const succeeds = (provider: string): IRecipeGenerator => ({
  generate: jest.fn(async () => ok(recipeFrom(provider))),
});

describe('FallbackRecipeGenerator', () => {
  it('returns the first provider that answers, without asking the rest', async () => {
    const second = succeeds('groq');
    const chain = new FallbackRecipeGenerator([succeeds('gemini'), second]);

    const result = await chain.generate(REQUEST);

    expect(result.ok && result.value.provider).toBe('gemini');
    expect(second.generate).not.toHaveBeenCalled();
  });

  it('moves on when a provider is out of quota', async () => {
    const first: IRecipeGenerator = {
      generate: jest.fn(async () => fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'))),
    };
    const chain = new FallbackRecipeGenerator([first, succeeds('groq')]);

    const result = await chain.generate(REQUEST);

    expect(first.generate).toHaveBeenCalled();
    expect(result.ok && result.value.provider).toBe('groq');
  });

  it('moves on when a provider returns something that is not the agreed JSON', async () => {
    // A model that emits garbage has come up just as short as one that is
    // unreachable — the user asked for a recipe and this provider has none.
    const first: IRecipeGenerator = {
      generate: jest.fn(async () =>
        fail(new UnprocessableFailure('errors.ai.invalid_response', 'response')),
      ),
    };
    const chain = new FallbackRecipeGenerator([first, succeeds('groq')]);

    const result = await chain.generate(REQUEST);

    expect(result.ok && result.value.provider).toBe('groq');
  });

  it('stops on a failure that is the answer rather than a shortfall', async () => {
    // Nothing on this port returns a refusal today. The rule is written for the
    // day one is added: a second provider asked to redo a request the first
    // legitimately refused would just launder the refusal.
    const second = succeeds('groq');
    const first: IRecipeGenerator = {
      generate: jest.fn(async () => fail(new ConflictFailure('errors.conflict.recipe_exists'))),
    };
    const chain = new FallbackRecipeGenerator([first, second]);

    const result = await chain.generate(REQUEST);

    expect(result.ok).toBe(false);
    expect(second.generate).not.toHaveBeenCalled();
  });

  it('reports the LAST provider’s failure when nobody can answer', async () => {
    const chain = new FallbackRecipeGenerator([
      { generate: jest.fn(async () => fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'))) },
      { generate: jest.fn(async () => fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'))) },
    ]);

    const result = await chain.generate(REQUEST);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.messageKey).toBe('errors.ai.invalid_response');
  });
});

describe('createRecipeGenerator', () => {
  const pool = (...keys: string[]) => new ApiKeyPool(keys);

  it('asks Gemini before Groq', () => {
    // Asserted through the boot log rather than by reaching into the chain's
    // private field: the order is the whole requirement, so it deserves an
    // assertion that survives the class being refactored.
    const chain = createRecipeGenerator({
      geminiKeys: pool('g-1'),
      groqKeys: pool('q-1'),
      geminiModel: 'gemini-flash-latest',
      groqModel: 'openai/gpt-oss-120b',
      anthropicModel: 'claude-haiku-4-5',
    });

    expect(chain).toBeInstanceOf(FallbackRecipeGenerator);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ providers: ['gemini', 'groq'] }),
      'recipe_generator_chain_ready',
    );
  });

  it('puts Anthropic last when it is configured too', () => {
    createRecipeGenerator({
      geminiKeys: pool('g-1'),
      groqKeys: pool('q-1'),
      geminiModel: 'gemini-flash-latest',
      groqModel: 'openai/gpt-oss-120b',
      anthropicModel: 'claude-haiku-4-5',
      anthropicApiKey: 'a-1',
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ providers: ['gemini', 'groq', 'anthropic'] }),
      'recipe_generator_chain_ready',
    );
  });

  it('builds Gemini from the plural key var, which is the one production sets', () => {
    // The singular GEMINI_API_KEY is empty on the deployed box. A chain built
    // from it would have skipped Gemini and changed nothing — the whole point
    // of this change, silently absent.
    const chain = createRecipeGenerator({
      geminiKeys: pool('from-GEMINI_API_KEYS'),
      groqKeys: pool(),
      geminiModel: 'gemini-flash-latest',
      groqModel: 'openai/gpt-oss-120b',
      anthropicModel: 'claude-haiku-4-5',
    });

    expect(chain).toBeInstanceOf(GeminiRecipeGenerator);
  });

  it('leaves a single provider unwrapped, so one-provider boxes behave as before', () => {
    const chain = createRecipeGenerator({
      geminiKeys: pool(),
      groqKeys: pool('q-1'),
      geminiModel: 'gemini-flash-latest',
      groqModel: 'openai/gpt-oss-120b',
      anthropicModel: 'claude-haiku-4-5',
    });

    expect(chain).toBeInstanceOf(GroqRecipeGenerator);
  });

  it('still boots with no keys at all', () => {
    const chain = createRecipeGenerator({
      geminiKeys: pool(),
      groqKeys: pool(),
      geminiModel: 'gemini-flash-latest',
      groqModel: 'openai/gpt-oss-120b',
      anthropicModel: 'claude-haiku-4-5',
    });

    expect(chain).toBeInstanceOf(DisabledRecipeGenerator);
  });
});
