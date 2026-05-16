import type { IRecipeModerator } from '@application/recipes/ports/i-recipe-moderator';
import { GroqRecipeModerator } from '@infrastructure/ai/groq-recipe-moderator';
import { DisabledRecipeModerator } from '@infrastructure/ai/disabled-recipe-moderator';
import { logger } from '@presentation/server/logger';

export interface RecipeModeratorFactoryInput {
  readonly apiKey?: string | undefined;
  readonly model: string;
}

export function createRecipeModerator(input: RecipeModeratorFactoryInput): IRecipeModerator {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    logger.warn('GROQ_API_KEY not set — recipe moderation disabled, all recipes auto-approved');
    return new DisabledRecipeModerator();
  }
  return new GroqRecipeModerator({ apiKey: input.apiKey, model: input.model });
}
