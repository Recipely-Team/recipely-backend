import type { IPromptModerator } from '@application/ai/ports/i-prompt-moderator';
import { GroqPromptModerator } from '@infrastructure/ai/groq-prompt-moderator';
import { DisabledPromptModerator } from '@infrastructure/ai/disabled-prompt-moderator';
import { logger } from '@presentation/server/logger';

export interface PromptModeratorFactoryInput {
  readonly apiKey?: string | undefined;
  readonly model: string;
}

export function createPromptModerator(input: PromptModeratorFactoryInput): IPromptModerator {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    logger.warn('GROQ_API_KEY not set — prompt moderation disabled, all prompts auto-approved');
    return new DisabledPromptModerator();
  }
  return new GroqPromptModerator({ apiKey: input.apiKey, model: input.model });
}
