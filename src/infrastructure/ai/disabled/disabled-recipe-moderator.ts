import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IRecipeModerator, ModerateRecipeRequest, ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';

// Used when no GROQ_API_KEY is configured (e.g. local dev without AI keys).
// Auto-approves all recipes so the platform remains fully functional.
// Contrast with runtime Groq errors: those return fail(...) and the use case
// saves the recipe as pending. This adapter never errors — it simply skips moderation.
export class DisabledRecipeModerator implements IRecipeModerator {
  async moderate(_req: ModerateRecipeRequest): Promise<Result<ModerationVerdict, Failure>> {
    return ok({ status: 'approved' });
  }
}
