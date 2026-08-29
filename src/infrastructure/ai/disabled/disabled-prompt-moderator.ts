import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IPromptModerator, ModeratePromptRequest } from '@application/ai/ports/i-prompt-moderator';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';

// Fallback used when no GROQ_API_KEY is configured. Auto-approves so local dev
// without AI keys still works end-to-end.
export class DisabledPromptModerator implements IPromptModerator {
  async moderate(_req: ModeratePromptRequest): Promise<Result<ModerationVerdict, Failure>> {
    return ok({ status: 'approved' });
  }
}
