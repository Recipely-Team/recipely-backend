import type { IRecipeRefiner } from '@application/ai/ports/i-recipe-refiner';
import { GeminiRecipeRefiner } from '@infrastructure/ai/gemini-recipe-refiner';
import { AnthropicRecipeRefiner } from '@infrastructure/ai/anthropic-recipe-refiner';
import { GroqRecipeRefiner } from '@infrastructure/ai/groq-recipe-refiner';
import { DisabledRecipeRefiner } from '@infrastructure/ai/disabled-recipe-refiner';
import type { AIGeneratorFactoryInput } from '@infrastructure/ai/recipe-generator-factory';
import { logger } from '@presentation/server/logger';

export function createRecipeRefiner(input: AIGeneratorFactoryInput): IRecipeRefiner {
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
