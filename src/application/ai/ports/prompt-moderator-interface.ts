import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ModerationVerdict } from '@application/recipes/ports/recipe-moderator-interface';

export interface ModeratePromptRequest {
  readonly prompt: string;
}

// Pre-flight moderation for the free-text prompt the user sends to the AI
// recipe generator. The output moderator (`RecipeModeratorInterface`) only sees the
// AI's reply, which is too late — a profane / hateful / sexual prompt should
// be rejected before we spend an LLM call on it.
export interface PromptModeratorInterface {
  moderate(req: ModeratePromptRequest): Promise<Result<ModerationVerdict, Failure>>;
}
