import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ModerationVerdict } from '@application/recipes/ports/recipe-moderator-interface';

export interface ModerateCommentRequest {
  readonly body: string;
}

export interface CommentModeratorInterface {
  moderate(req: ModerateCommentRequest): Promise<Result<ModerationVerdict, Failure>>;
}
