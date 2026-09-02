import type { CommentModeratorInterface } from '@application/comments/ports/comment-moderator-interface';
import { GroqCommentModerator } from '@infrastructure/ai/groq/groq-comment-moderator';
import { DisabledCommentModerator } from '@infrastructure/ai/disabled/disabled-comment-moderator';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface CommentModeratorFactoryInput {
  readonly apiKey?: string | undefined;
  readonly model: string;
}

export function createCommentModerator(input: CommentModeratorFactoryInput): CommentModeratorInterface {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    logger.warn('GROQ_API_KEY not set — comment moderation disabled, all comments auto-approved');
    return new DisabledCommentModerator();
  }
  return new GroqCommentModerator({ apiKey: input.apiKey, model: input.model });
}
