import type { IRecipeGenerator } from '@application/ai/ports/i-recipe-generator';
import { GeminiRecipeGenerator } from '@infrastructure/ai/gemini/gemini-recipe-generator';
import { GroqRecipeGenerator } from '@infrastructure/ai/groq/groq-recipe-generator';
import { DisabledRecipeGenerator } from '@infrastructure/ai/disabled/disabled-recipe-generator';
import { FallbackRecipeGenerator } from '@infrastructure/ai/fallback-recipe-generator';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface AIGeneratorFactoryInput {
  readonly geminiKeys: ApiKeyPool;
  readonly groqKeys: ApiKeyPool;
  readonly geminiModel: string;
  readonly groqModel: string;
}

/**
 * Assembles /generate from whichever providers hold keys.
 *
 * @remarks
 * - **Order is Gemini, then Groq.** Asking one provider and stopping meant a
 *   spent quota was an outage; the second seat is what turns it into a slower
 *   answer.
 * - **Anthropic is not in the chain.** `AnthropicRecipeGenerator` is still a
 *   placeholder that fails every call with `provider_not_configured` — the SDK
 *   is deliberately not installed. Seating it last would not add a provider,
 *   it would replace the real reason generation failed with a config error
 *   from a stub, because the chain reports the LAST failure. It becomes a seat
 *   the day it can generate something.
 * - **`AI_PROVIDER` does not select the generator any more.** It still picks
 *   the refiner and the moderators, which are single-provider. The same call
 *   was made for imports and for the same reason (see
 *   {@link createInstagramRecipeImporter}): the alternative to a second
 *   provider is an endpoint that stops. Leaving `AI_PROVIDER=groq` in place
 *   would have pinned production to exactly the order this change exists to
 *   reverse.
 * - **Keys come from pools, not from `GEMINI_API_KEY`.** That singular var is
 *   empty on production — the deployed key is in `GEMINI_API_KEYS` — so a
 *   chain built from it would have skipped Gemini and changed nothing.
 * - **No keys at all is still a boot.** The disabled adapter reports
 *   `provider_not_configured` rather than the process refusing to start.
 */
export function createRecipeGenerator(input: AIGeneratorFactoryInput): IRecipeGenerator {
  const generators: IRecipeGenerator[] = [];
  const providers: string[] = [];

  if (input.geminiKeys.size > 0) {
    generators.push(new GeminiRecipeGenerator({ keys: input.geminiKeys, model: input.geminiModel }));
    providers.push('gemini');
  }
  if (input.groqKeys.size > 0) {
    generators.push(new GroqRecipeGenerator({ keys: input.groqKeys, model: input.groqModel }));
    providers.push('groq');
  }

  if (generators.length === 0) {
    logger.warn('No Gemini or Groq API keys — /generate disabled until one is set');
    return new DisabledRecipeGenerator();
  }

  logger.info(
    {
      providers,
      geminiKeyCount: input.geminiKeys.size,
      groqKeyCount: input.groqKeys.size,
    },
    'recipe_generator_chain_ready',
  );

  // A single provider needs no wrapper, and keeping it unwrapped means the
  // one-provider deployment behaves exactly as it did before this change.
  return generators.length === 1 && generators[0] !== undefined
    ? generators[0]
    : new FallbackRecipeGenerator(generators);
}
