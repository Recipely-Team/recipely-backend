import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, type Failure } from '@core/failure';
import { CreatorStatus } from '@domain/users/creator-status';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';

export interface ReviewCreatorTagInput {
  readonly userId: string;
  readonly decision: typeof CreatorStatus.Approved | typeof CreatorStatus.Rejected;
}

/**
 * **Admin approve / reject of a pending creator claim** (AdminJS User actions).
 *
 * @remarks
 * - Only a pending claim moves (`errors.conflict.creator_not_pending`
 *   otherwise, including when there is no claim at all).
 * - Approval refuses a handle another user already holds approved
 *   (`errors.conflict.creator_handle_taken`); the store's partial unique index
 *   is the backstop for two approvals racing past this check.
 */
export class ReviewCreatorTagUseCase {
  constructor(
    private readonly creatorTags: CreatorTagRepositoryInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ReviewCreatorTagInput): Promise<Result<void, Failure>> {
    const current = await this.creatorTags.findByUserId(input.userId);
    if (!current.ok) return current;
    const tag = current.value;
    if (tag === null) return fail(new ConflictFailure('errors.conflict.creator_not_pending'));

    if (input.decision === CreatorStatus.Approved) {
      const taken = await this.creatorTags.isHandleApprovedForAnotherUser(tag.account, input.userId);
      if (!taken.ok) return taken;
      if (taken.value) return fail(new ConflictFailure('errors.conflict.creator_handle_taken'));
    }

    const reviewed = input.decision === CreatorStatus.Approved ? tag.approve(this.now()) : tag.reject(this.now());
    if (!reviewed.ok) return reviewed;
    const saved = await this.creatorTags.save(input.userId, reviewed.value);
    return saved.ok ? ok(undefined) : saved;
  }
}
