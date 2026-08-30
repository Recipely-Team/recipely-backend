import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IImageModerator, ModerateImageRequest } from '@application/ai/ports/i-image-moderator';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';

/**
 * Used when no AI key is configured at all — local development, mostly.
 *
 * Approves, which is the same choice the text moderators here make and for the
 * same reason: an unconfigured platform has to remain usable end to end. It is
 * NOT the same case as a configured moderator that failed — that one is a
 * failure and refuses the upload. The difference is deliberate: one is an
 * operator saying "no moderation here", the other is a moderator unable to
 * speak, and only the first is a decision anybody made.
 */
export class DisabledImageModerator implements IImageModerator {
  async moderate(_req: ModerateImageRequest): Promise<Result<ModerationVerdict, Failure>> {
    return ok({ status: 'approved' });
  }
}
