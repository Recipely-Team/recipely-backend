import { ModerationStatus } from '@domain/moderation/moderation-status';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { NotificationService } from '@application/notifications/notification-service';

export type RecipeModerationDecision = typeof ModerationStatus.Approved | typeof ModerationStatus.Rejected;

export interface ModerateRecipeInput {
  readonly recipeId: string;
  readonly decision: RecipeModerationDecision;
}

/**
 * Backs the admin panel's approve/reject buttons on Recipe — the human
 * override of the AI moderator's verdict. The status also changes when the
 * owner publishes or unpublishes (`application/recipes/publishing/`); the
 * buttons are hidden on a private (`unreviewed`) recipe, so an admin cannot
 * publish something its owner kept to themselves. `isPublished` always tracks the decision, mirroring how
 * create-recipe-use-case derives it from the same verdict.
 */
export class ModerateRecipeUseCase {
  constructor(
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly notificationService: NotificationService | null = null,
  ) {}

  async execute(input: ModerateRecipeInput): Promise<Result<void, Failure>> {
    const isPublished = input.decision === ModerationStatus.Approved;
    const result = await this.recipeRepo.setModerationStatus(input.recipeId, input.decision, isPublished);
    if (!result.ok) return result;

    if (this.notificationService !== null) {
      this.notificationService.notify({
        recipientId: result.value.ownerId,
        type: 'moderation',
        recipeId: input.recipeId,
        title: input.decision === ModerationStatus.Approved ? 'Recipe approved' : 'Recipe rejected',
        body:
          input.decision === ModerationStatus.Approved
            ? 'Your recipe was approved and is now live.'
            : 'Your recipe was rejected by moderation.',
      });
    }

    return ok(undefined);
  }
}
