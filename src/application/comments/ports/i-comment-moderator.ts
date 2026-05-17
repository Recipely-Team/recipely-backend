import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';

export interface ModerateCommentRequest {
  readonly body: string;
}

export interface ICommentModerator {
  moderate(req: ModerateCommentRequest): Promise<Result<ModerationVerdict, Failure>>;
}
