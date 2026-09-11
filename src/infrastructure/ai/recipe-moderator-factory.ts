import type { RecipeModeratorInterface } from '@application/recipes/ports/recipe-moderator-interface';
import { GroqRecipeModerator } from '@infrastructure/ai/groq/groq-recipe-moderator';
import { DisabledRecipeModerator } from '@infrastructure/ai/disabled/disabled-recipe-moderator';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface RecipeModeratorFactoryInput {
  readonly apiKey?: string | undefined;
  readonly model: string;
}

export function createRecipeModerator(input: RecipeModeratorFactoryInput): RecipeModeratorInterface {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    logger.warn('GROQ_API_KEY not set — recipe moderation disabled, all recipes auto-approved');
    return new DisabledRecipeModerator();
  }
  return new GroqRecipeModerator({ apiKey: input.apiKey, model: input.model });
}
