import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { NotificationService } from '@application/notifications/notification-service';

export type RecipeModerationDecision = 'approved' | 'rejected';

export interface ModerateRecipeInput {
  readonly recipeId: string;
  readonly decision: RecipeModerationDecision;
}

/**
 * Backs the admin panel's approve/reject buttons on Recipe. A decision is the
 * only way `moderationStatus` changes after creation — `create-recipe-use-case`
 * sets the initial value from the AI moderator's verdict, this is the human
 * override. `isPublished` always tracks the decision, mirroring how
 * create-recipe-use-case derives it from the same verdict.
 */
export class ModerateRecipeUseCase {
  constructor(
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly notificationService: NotificationService | null = null,
  ) {}

  async execute(input: ModerateRecipeInput): Promise<Result<void, Failure>> {
    const isPublished = input.decision === 'approved';
    const result = await this.recipeRepo.setModerationStatus(input.recipeId, input.decision, isPublished);
    if (!result.ok) return result;

    if (this.notificationService !== null) {
      this.notificationService.notify({
        recipientId: result.value.ownerId,
        type: 'moderation',
        recipeId: input.recipeId,
        title: input.decision === 'approved' ? 'Recipe approved' : 'Recipe rejected',
        body:
          input.decision === 'approved'
            ? 'Your recipe was approved and is now live.'
            : 'Your recipe was rejected by moderation.',
      });
    }

    return ok(undefined);
  }
}
