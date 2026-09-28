import { ok, fail, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import {
  ModerationRejection,
  type ModerateRecipeRequest,
  type RecipeModeratorInterface,
} from '@application/recipes/ports/recipe-moderator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';

/** What asking to publish came to: the moderation state, and whether it is now public. */
interface PublicationVerdict {
  readonly moderationStatus: ModerationStatus;
  readonly isPublished: boolean;
}

/**
 * Runs the AI moderator on a recipe someone wants public, and says what that
 * makes it.
 *
 * @remarks
 * - **One place for the one rule**, shared by publishing at creation (an older
 *   client) and publishing a saved recipe later. Two copies of "what does a
 *   verdict mean" would drift the first time either was touched.
 * - **Approved is public; a moderator that could not answer leaves it in
 *   review** (hidden, `pending`, for a person to decide); **unsafe content is
 *   kept but hidden** (`rejected`).
 * - **A meaningless name is refused, not shelved.** The person did nothing
 *   wrong and can fix it in five seconds — but only if somebody tells them.
 */
export const reviewForPublication = async (
  moderator: RecipeModeratorInterface,
  logger: LoggerInterface,
  request: ModerateRecipeRequest,
): Promise<Result<PublicationVerdict, Failure>> => {
  const verdict = await moderator.moderate(request);
  if (!verdict.ok) {
    logger.warn(
      { code: verdict.failure.code, messageKey: verdict.failure.messageKey },
      'recipe_publication_moderation_upstream_error — left in review',
    );
    return ok({ moderationStatus: ModerationStatus.Pending, isPublished: false });
  }
  if (verdict.value.status === ModerationStatus.Approved) {
    return ok({ moderationStatus: ModerationStatus.Approved, isPublished: true });
  }
  if (verdict.value.kind === ModerationRejection.Meaningless) {
    return fail(new ValidationFailure('errors.recipe.name_meaningless', 'name'));
  }
  return ok({ moderationStatus: ModerationStatus.Rejected, isPublished: false });
};
