import { fail, ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { CreatorHandle } from '@domain/users/creator-handle';
import { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorPlatform } from '@domain/users/creator-platform';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import type { CreatorTagDto } from '@application/users/dtos/creator-tag.dto';

export interface RequestCreatorTagInput {
  readonly userId: string;
  readonly platform: CreatorPlatform;
  readonly handle: string;
}

/**
 * **`PUT /me/creator`** — claims a social account, pending an admin's review.
 *
 * @remarks
 * - The handle is validated (`errors.validation.creator_handle`) and then
 *   checked by the content moderator, exactly as a bio is.
 * - Re-sending the approved claim changes nothing; any other claim replaces
 *   the current one as pending (`CreatorTag.request`). A no-op is not written.
 */
export class RequestCreatorTagUseCase {
  constructor(
    private readonly creatorTags: CreatorTagRepositoryInterface,
    private readonly contentModerator: ContentModeratorInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: RequestCreatorTagInput): Promise<Result<CreatorTagDto, Failure>> {
    const handle = CreatorHandle.create(input.platform, input.handle);
    if (!handle.ok) return handle;

    const verdict = this.contentModerator.moderate({ text: handle.value.value, context: 'general' });
    if (verdict.status === ModerationStatus.Rejected) return fail(contentBlockedFailure(verdict.hit));

    const current = await this.creatorTags.findByUserId(input.userId);
    if (!current.ok) return current;

    const next = CreatorTag.request(handle.value, this.now(), current.value);
    if (next !== current.value) {
      const saved = await this.creatorTags.save(input.userId, next);
      if (!saved.ok) return saved;
    }
    return ok({ platform: next.platform, handle: next.handle, status: next.status });
  }
}
