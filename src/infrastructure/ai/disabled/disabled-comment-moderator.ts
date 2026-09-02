import { ModerationStatus } from '@domain/moderation/moderation-status';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { CommentModeratorInterface, ModerateCommentRequest } from '@application/comments/ports/comment-moderator-interface';
import type { ModerationVerdict } from '@application/recipes/ports/recipe-moderator-interface';

// Used when no GROQ_API_KEY is configured (e.g. local dev without AI keys).
// Auto-approves all comments so the platform remains fully functional.
export class DisabledCommentModerator implements CommentModeratorInterface {
  async moderate(_req: ModerateCommentRequest): Promise<Result<ModerationVerdict, Failure>> {
    return ok({ status: ModerationStatus.Approved });
  }
}
