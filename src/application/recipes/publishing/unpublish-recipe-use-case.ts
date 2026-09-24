import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipePublicationDto } from '@application/recipes/publishing/recipe-publication.dto';

export interface UnpublishRecipeInput {
  readonly recipeId: string;
  readonly requesterId: string;
}

/**
 * Takes a recipe out of public view and back into its owner's private library.
 *
 * @remarks
 * - **Owner only**, like publishing.
 * - **Back to `unreviewed`, not left at `approved`.** A private recipe is one
 *   nobody has been asked to look at; keeping an old approval on it would let
 *   an admin action, or a later edit, put it back in the feed without the
 *   owner asking. Publishing again runs moderation again.
 */
export class UnpublishRecipeUseCase {
  constructor(private readonly repo: RecipeRepositoryInterface) {}

  async execute(input: UnpublishRecipeInput): Promise<Result<RecipePublicationDto, Failure>> {
    const found = await this.repo.getById(input.recipeId, input.requesterId);
    if (!found.ok) return found;
    if (found.value.recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const saved = await this.repo.setModerationStatus(input.recipeId, ModerationStatus.Unreviewed, false);
    if (!saved.ok) return saved;

    return ok({ isPublished: false, moderationStatus: ModerationStatus.Unreviewed });
  }
}
