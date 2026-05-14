import type { IRecipeGenerator } from '@application/ai/ports/i-recipe-generator';
import { GeminiRecipeGenerator } from '@infrastructure/ai/gemini-recipe-generator';
import { AnthropicRecipeGenerator } from '@infrastructure/ai/anthropic-recipe-generator';
import { GroqRecipeGenerator } from '@infrastructure/ai/groq-recipe-generator';
import { DisabledRecipeGenerator } from '@infrastructure/ai/disabled-recipe-generator';
import { logger } from '@presentation/server/logger';

export type AIProvider = 'gemini' | 'anthropic' | 'groq';

export interface AIGeneratorFactoryInput {
  readonly provider: AIProvider;
  readonly model: string;
  readonly geminiApiKey?: string | undefined;
  readonly anthropicApiKey?: string | undefined;
  readonly groqApiKey?: string | undefined;
}

// Selects the AI adapter at composition root. Falls back to a disabled
// no-op adapter (logs a warning) when the chosen provider's API key is
// missing — AI is optional, so a fresh env without GEMINI_API_KEY must
// still boot the rest of the API. The /generate endpoint surfaces a clear
// `errors.ai.provider_not_configured` failure until the key is provided.
export function createRecipeGenerator(input: AIGeneratorFactoryInput): IRecipeGenerator {
  switch (input.provider) {
    case 'gemini': {
      if (!input.geminiApiKey || input.geminiApiKey.trim().length === 0) {
        logger.warn(
          'AI_PROVIDER=gemini but GEMINI_API_KEY is empty — /generate disabled until key is set',
        );
        return new DisabledRecipeGenerator();
      }
      return new GeminiRecipeGenerator({ apiKey: input.geminiApiKey, model: input.model });
    }
    case 'anthropic': {
      if (!input.anthropicApiKey || input.anthropicApiKey.trim().length === 0) {
        logger.warn(
          'AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty — /generate disabled until key is set',
        );
        return new DisabledRecipeGenerator();
      }
      return new AnthropicRecipeGenerator({
        apiKey: input.anthropicApiKey,
        model: input.model,
      });
    }
    case 'groq': {
      if (!input.groqApiKey || input.groqApiKey.trim().length === 0) {
        logger.warn(
          'AI_PROVIDER=groq but GROQ_API_KEY is empty — /generate disabled until key is set',
        );
        return new DisabledRecipeGenerator();
      }
      return new GroqRecipeGenerator({ apiKey: input.groqApiKey, model: input.model });
    }
  }
}
