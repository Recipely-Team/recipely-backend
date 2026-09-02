import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PromptModeratorInterface, ModeratePromptRequest } from '@application/ai/ports/prompt-moderator-interface';
import type { ModerationVerdict } from '@application/recipes/ports/recipe-moderator-interface';

// Fallback used when no GROQ_API_KEY is configured. Auto-approves so local dev
// without AI keys still works end-to-end.
export class DisabledPromptModerator implements PromptModeratorInterface {
  async moderate(_req: ModeratePromptRequest): Promise<Result<ModerationVerdict, Failure>> {
    return ok({ status: 'approved' });
  }
}
