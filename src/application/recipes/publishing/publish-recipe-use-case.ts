import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeModeratorInterface } from '@application/recipes/ports/recipe-moderator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { reviewForPublication } from '@application/recipes/publishing/review-for-publication';
import type { RecipePublicationDto } from '@application/recipes/publishing/recipe-publication.dto';

export interface PublishRecipeInput {
  readonly recipeId: string;
  readonly requesterId: string;
}

/**
 * Makes a saved recipe public, if moderation agrees.
 *
 * @remarks
 * - **The owner's deliberate step.** Saving is private; this is the only way a
 *   recipe reaches the feed, so it is the one place moderation runs for it.
 * - **Owner only.** Anyone else gets `forbidden`, not a silent success.
 * - **Every outcome is an answer, not a failure**: published, in review, or
 *   rejected — the caller shows whichever it is. Only a meaningless name is
 *   refused, because that one the owner can fix.
 */
export class PublishRecipeUseCase {
  constructor(
    private readonly repo: RecipeRepositoryInterface,
    private readonly moderator: RecipeModeratorInterface,
    private readonly logger: LoggerInterface,
  ) {}

  async execute(input: PublishRecipeInput): Promise<Result<RecipePublicationDto, Failure>> {
    const found = await this.repo.getById(input.recipeId, input.requesterId);
    if (!found.ok) return found;
    const recipe = found.value.recipe;
    if (recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const verdict = await reviewForPublication(this.moderator, this.logger, recipe.textForReview());
    if (!verdict.ok) return verdict;

    const saved = await this.repo.setModerationStatus(
      input.recipeId,
      verdict.value.moderationStatus,
      verdict.value.isPublished,
    );
    if (!saved.ok) return saved;

    return ok({ isPublished: verdict.value.isPublished, moderationStatus: verdict.value.moderationStatus });
  }
}
