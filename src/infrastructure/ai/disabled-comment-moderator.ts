import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ICommentModerator, ModerateCommentRequest } from '@application/comments/ports/i-comment-moderator';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';

// Used when no GROQ_API_KEY is configured (e.g. local dev without AI keys).
// Auto-approves all comments so the platform remains fully functional.
export class DisabledCommentModerator implements ICommentModerator {
  async moderate(_req: ModerateCommentRequest): Promise<Result<ModerationVerdict, Failure>> {
    return ok({ status: 'approved' });
  }
}
