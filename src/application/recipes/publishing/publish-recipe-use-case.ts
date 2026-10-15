import { ok, type Result } from '@core/result/result';
import { ConflictFailure, ForbiddenFailure, type Failure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeModeratorInterface } from '@application/recipes/ports/recipe-moderator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { reviewForPublication } from '@application/recipes/publishing/review-for-publication';
import type { RecipePublicationDto } from '@application/recipes/publishing/recipe-publication.dto';
import type { RecipeWentPublicListenerInterface } from '@application/recipes/ports/recipe-went-public-listener-interface';

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
 * - **The copyright gate runs before the moderator.** A web import still
 *   carrying the site's photo, ingredient list or steps is refused with the
 *   list of what remains (`details.blockers`), without spending a moderator
 *   call on text that cannot be published anyway. See `publishBlockersOf`.
 * - **Moderation runs once per request to publish.** A rejected recipe cannot
 *   be sent again until someone can retry the AI into a yes, a pending one is
 *   left to the person reviewing it, and a public one is not re-judged.
 */
export class PublishRecipeUseCase {
  constructor(
    private readonly repo: RecipeRepositoryInterface,
    private readonly moderator: RecipeModeratorInterface,
    private readonly logger: LoggerInterface,
    private readonly onPublic?: RecipeWentPublicListenerInterface,
  ) {}

  async execute(input: PublishRecipeInput): Promise<Result<RecipePublicationDto, Failure>> {
    const found = await this.repo.getById(input.recipeId, input.requesterId);
    if (!found.ok) return found;
    const recipe = found.value.recipe;
    if (recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    // A decision already made is not the owner's to re-roll. A rejection —
    // the AI's or an admin's — stands; one waiting for a person waits; one
    // already public stays as it is, without another moderator call that
    // could take it down.
    if (recipe.moderationStatus === ModerationStatus.Rejected) {
      return { ok: false, failure: new ConflictFailure('errors.recipe.publish_rejected') };
    }
    if (recipe.moderationStatus === ModerationStatus.Pending || (recipe.moderationStatus === ModerationStatus.Approved && recipe.isPublished)) {
      return ok({ isPublished: recipe.isPublished, moderationStatus: recipe.moderationStatus });
    }

    const blockers = recipe.publishBlockers();
    if (blockers.length > 0) {
      return { ok: false, failure: new ConflictFailure('errors.recipe.publish_blocked_copyright', { blockers }) };
    }

    const verdict = await reviewForPublication(this.moderator, this.logger, recipe.textForReview());
    if (!verdict.ok) return verdict;

    const saved = await this.repo.setModerationStatus(
      input.recipeId,
      verdict.value.moderationStatus,
      verdict.value.isPublished,
    );
    if (!saved.ok) return saved;
    if (verdict.value.isPublished) this.onPublic?.wentPublic(input.recipeId);

    return ok({ isPublished: verdict.value.isPublished, moderationStatus: verdict.value.moderationStatus });
  }
}
