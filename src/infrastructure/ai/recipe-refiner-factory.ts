import type { RecipeRefinerInterface } from '@application/ai/ports/recipe-refiner-interface';
import { GeminiRecipeRefiner } from '@infrastructure/ai/gemini/gemini-recipe-refiner';
import { AnthropicRecipeRefiner } from '@infrastructure/ai/anthropic/anthropic-recipe-refiner';
import { GroqRecipeRefiner } from '@infrastructure/ai/groq/groq-recipe-refiner';
import { DisabledRecipeRefiner } from '@infrastructure/ai/disabled/disabled-recipe-refiner';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export type AIProvider = 'gemini' | 'anthropic' | 'groq';

/**
 * Single-provider selection, chosen by `AI_PROVIDER`.
 *
 * @remarks
 * This shape used to be shared with the recipe generator, which is why it was
 * imported from that factory. The generator now asks every provider it has a
 * key for, in order, so the two no longer describe the same thing — /refine
 * keeps the one-provider contract until it is given the same treatment.
 */
export interface AIRefinerFactoryInput {
  readonly provider: AIProvider;
  readonly model: string;
  readonly geminiApiKey?: string | undefined;
  readonly anthropicApiKey?: string | undefined;
  readonly groqApiKey?: string | undefined;
}

export function createRecipeRefiner(input: AIRefinerFactoryInput): RecipeRefinerInterface {
  switch (input.provider) {
    case 'gemini': {
      if (!input.geminiApiKey || input.geminiApiKey.trim().length === 0) {
        logger.warn(
          'AI_PROVIDER=gemini but GEMINI_API_KEY is empty — /refine disabled until key is set',
        );
        return new DisabledRecipeRefiner();
      }
      return new GeminiRecipeRefiner({ apiKey: input.geminiApiKey, model: input.model });
    }
    case 'anthropic': {
      if (!input.anthropicApiKey || input.anthropicApiKey.trim().length === 0) {
        logger.warn(
          'AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty — /refine disabled until key is set',
        );
        return new DisabledRecipeRefiner();
      }
      return new AnthropicRecipeRefiner({ apiKey: input.anthropicApiKey, model: input.model });
    }
    case 'groq': {
      if (!input.groqApiKey || input.groqApiKey.trim().length === 0) {
        logger.warn(
          'AI_PROVIDER=groq but GROQ_API_KEY is empty — /refine disabled until key is set',
        );
        return new DisabledRecipeRefiner();
      }
      return new GroqRecipeRefiner({ apiKey: input.groqApiKey, model: input.model });
    }
    default: {
      logger.warn({ provider: input.provider }, 'Unknown AI provider — /refine disabled');
      return new DisabledRecipeRefiner();
    }
  }
}
