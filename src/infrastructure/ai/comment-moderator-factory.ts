import type { ICommentModerator } from '@application/comments/ports/i-comment-moderator';
import { GroqCommentModerator } from '@infrastructure/ai/groq-comment-moderator';
import { DisabledCommentModerator } from '@infrastructure/ai/disabled-comment-moderator';
import { logger } from '@presentation/server/logger';

export interface CommentModeratorFactoryInput {
  readonly apiKey?: string | undefined;
  readonly model: string;
}

export function createCommentModerator(input: CommentModeratorFactoryInput): ICommentModerator {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    logger.warn('GROQ_API_KEY not set — comment moderation disabled, all comments auto-approved');
    return new DisabledCommentModerator();
  }
  return new GroqCommentModerator({ apiKey: input.apiKey, model: input.model });
}
