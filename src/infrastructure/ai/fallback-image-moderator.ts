import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { IImageModerator, ModerateImageRequest } from '@application/ai/ports/i-image-moderator';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Asks each moderator in turn and takes the first ANSWER — approval or refusal.
 *
 * @remarks
 * - **The same shape as {@link FallbackRecipeGenerator}, with one difference
 *   that matters: a verdict is never fallen through.** A rejection is an answer,
 *   so asking a second provider to look again would be shopping for the reply we
 *   wanted. Only a provider that could not answer at all — unreachable, out of
 *   quota, unreadable JSON — passes the photo along to the next one.
 * - **Everyone failing is a FAILURE, never an approval.** This is the whole
 *   reason the chain exists. A moderator that cannot be reached says nothing
 *   about the picture, and "we could not check it" must not become "it is
 *   fine": the caller turns the failure into a "try again in a moment", which
 *   costs a user one retry, while the other reading costs whatever the photo
 *   turns out to be.
 * - **Ordering is the factory's business**, not this class's — it holds
 *   whatever it is given, in the order it is given.
 */
export class FallbackImageModerator implements IImageModerator {
  constructor(private readonly moderators: readonly IImageModerator[]) {}

  async moderate(req: ModerateImageRequest): Promise<Result<ModerationVerdict, Failure>> {
    let lastFailure: Failure = new ServiceUnavailableFailure('errors.ai.upstream_failed');

    for (const moderator of this.moderators) {
      const result = await moderator.moderate(req);
      if (result.ok) return result;

      lastFailure = result.failure;
      logger.warn(
        { moderator: moderator.constructor.name, messageKey: result.failure.messageKey },
        'image_moderation_provider_unavailable — trying the next one',
      );
    }

    return fail(lastFailure);
  }
}
