import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, type Failure } from '@core/failure';
import { CreatorStatus } from '@domain/users/creator-status';
import type { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';
import type { NotificationService } from '@application/notifications/notification-service';

export type CreatorReviewDecision = typeof CreatorStatus.Approved | typeof CreatorStatus.Rejected;

export interface ReviewCreatorTagInput {
  /** The `creator_tags` row under review — one platform's claim. */
  readonly tagId: string;
  readonly decision: CreatorReviewDecision;
}

/**
 * **Admin approve / reject of one pending creator claim** (AdminJS CreatorTag actions).
 *
 * @remarks
 * - Acts on a single platform's claim; the user's tag on the other platform
 *   is neither read nor written.
 * - Only a pending claim moves (`errors.conflict.creator_not_pending`
 *   otherwise, including when the tag is gone or its owner deleted).
 * - The write is conditional on the claim still being the pending one read
 *   here (`saveReview`), so a change the user makes meanwhile is not reviewed
 *   by a decision about the old claim.
 * - Approval refuses a handle another user already holds approved
 *   (`errors.conflict.creator_handle_taken`); the store's partial unique index
 *   is the backstop for two approvals racing past this check.
 * - The owner is notified of the decision (`creator_approved` /
 *   `creator_rejected`), carrying the platform and handle it was about.
 */
export class ReviewCreatorTagUseCase {
  constructor(
    private readonly creatorTags: CreatorTagRepositoryInterface,
    private readonly notificationService: NotificationService | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ReviewCreatorTagInput): Promise<Result<void, Failure>> {
    const found = await this.creatorTags.findById(input.tagId);
    if (!found.ok) return found;
    if (found.value === null) return fail(new ConflictFailure('errors.conflict.creator_not_pending'));
    const { userId, tag } = found.value;

    if (input.decision === CreatorStatus.Approved) {
      const taken = await this.creatorTags.isHandleApprovedForAnotherUser(tag.account, userId);
      if (!taken.ok) return taken;
      if (taken.value) return fail(new ConflictFailure('errors.conflict.creator_handle_taken'));
    }

    const reviewed = input.decision === CreatorStatus.Approved ? tag.approve(this.now()) : tag.reject(this.now());
    if (!reviewed.ok) return reviewed;
    const saved = await this.creatorTags.saveReview(userId, reviewed.value);
    if (!saved.ok) return saved;

    this.notify(userId, reviewed.value);
    return ok(undefined);
  }

  private notify(userId: string, tag: CreatorTag): void {
    if (this.notificationService === null) return;
    const approved = tag.isApproved;
    void this.notificationService.notify({
      recipientId: userId,
      type: approved ? 'creator_approved' : 'creator_rejected',
      sourcePlatform: tag.platform,
      sourceHandle: tag.handle,
      title: approved ? 'Creator tag approved' : 'Creator tag not approved',
      body: approved
        ? `Your creator tag for @${tag.handle} is now on your profile.`
        : `Your creator tag request for @${tag.handle} was not approved.`,
    });
  }
}
