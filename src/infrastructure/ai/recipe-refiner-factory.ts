import type { RecipeRefinerInterface } from '@application/ai/ports/recipe-refiner-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { GeminiRecipeRefiner } from '@infrastructure/ai/gemini/gemini-recipe-refiner';
import { GroqRecipeRefiner } from '@infrastructure/ai/groq/groq-recipe-refiner';
import { FallbackRecipeRefiner } from '@infrastructure/ai/fallback-recipe-refiner';
import { DisabledRecipeRefiner } from '@infrastructure/ai/disabled/disabled-recipe-refiner';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface AIRefinerFactoryInput {
  readonly geminiKeys: ApiKeyPool;
  readonly groqKeys: ApiKeyPool;
  readonly geminiModel: string;
  readonly groqModel: string;
}

const NONE = 0;

/**
 * The refiners, in the order they are asked.
 *
 * @remarks
 * - **Order is Gemini, then Groq**, which is the order the generator has used
 *   since it gained a chain. This half never got the same treatment, and
 *   `AI_PROVIDER` defaults to `groq` — so every refinement in dev and in
 *   production went to Groq while the recipe beside it had been written by
 *   Gemini. A cook asking about their own ingredient was answered by the weaker
 *   seat, in a language it handles less well, and nothing anywhere said so.
 * - **`AI_PROVIDER` does not select the refiner any more.** It still picks the
 *   moderators, which are single-provider. Leaving it in charge here would have
 *   pinned both deployments to exactly the order this change exists to reverse,
 *   and the same call was already made for the generator and for imports.
 * - **Keys come from pools, not from `GEMINI_API_KEY`.** The singular var is
 *   empty on production — the deployed key is in `GEMINI_API_KEYS` — so a
 *   chain built from it would have skipped Gemini and changed nothing. This
 *   factory took the singular one, which is why setting `AI_PROVIDER=gemini`
 *   would not have fixed anything either: it would have disabled /refine.
 * - **Anthropic is not a seat.** `AnthropicRecipeRefiner` fails every call with
 *   `provider_not_configured` — the SDK is deliberately not installed — and the
 *   chain reports the LAST failure, so seating it would replace the real reason
 *   with a config error from a stub.
 * - **No keys at all is still a boot**: the disabled adapter reports
 *   `provider_not_configured` rather than the process refusing to start.
 */
export function createRecipeRefiner(input: AIRefinerFactoryInput): RecipeRefinerInterface {
  const refiners: RecipeRefinerInterface[] = [];
  const providers: string[] = [];

  if (input.geminiKeys.size > NONE) {
    refiners.push(new GeminiRecipeRefiner({ keys: input.geminiKeys, model: input.geminiModel }));
    providers.push('gemini');
  }
  if (input.groqKeys.size > NONE) {
    refiners.push(new GroqRecipeRefiner({ keys: input.groqKeys, model: input.groqModel }));
    providers.push('groq');
  }

  if (refiners.length === NONE) {
    logger.warn('No Gemini or Groq API keys — /refine disabled until one is set');
    return new DisabledRecipeRefiner();
  }

  logger.info(
    { providers, geminiKeyCount: input.geminiKeys.size, groqKeyCount: input.groqKeys.size },
    'recipe_refiner_chain_ready',
  );

  // A single provider needs no wrapper, and keeping it unwrapped means a
  // one-provider deployment behaves exactly as it did before this change.
  const [only] = refiners;
  return refiners.length === 1 && only !== undefined ? only : new FallbackRecipeRefiner(refiners);
}
