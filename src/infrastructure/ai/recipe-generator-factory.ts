import type { IRecipeGenerator } from '@application/ai/ports/i-recipe-generator';
import { GeminiRecipeGenerator } from '@infrastructure/ai/gemini/gemini-recipe-generator';
import { AnthropicRecipeGenerator } from '@infrastructure/ai/anthropic/anthropic-recipe-generator';
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
  readonly anthropicApiKey?: string | undefined;
  readonly anthropicModel: string;
}

/**
 * Assembles /generate from whichever providers hold keys.
 *
 * @remarks
 * - **Order is Gemini, then Groq**, then Anthropic if a key is set. Asking one
 *   provider and stopping meant a spent quota was an outage; the second seat
 *   is what turns it into a slower answer.
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
  if (input.anthropicApiKey !== undefined && input.anthropicApiKey.trim().length > 0) {
    generators.push(
      new AnthropicRecipeGenerator({ apiKey: input.anthropicApiKey, model: input.anthropicModel }),
    );
    providers.push('anthropic');
  }

  if (generators.length === 0) {
    logger.warn('No Gemini, Groq or Anthropic API keys — /generate disabled until one is set');
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
