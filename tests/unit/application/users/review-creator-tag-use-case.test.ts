import { fail, ok } from '@core/result/result';
import { ConflictFailure } from '@core/failure';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { CreatorTag } from '@domain/users/creator-tag';
import type { NotificationService } from '@application/notifications/notification-service';
import { ReviewCreatorTagUseCase } from '@application/users/use-cases/review-creator-tag-use-case';
import { InMemoryCreatorTagRepository } from '../../fixtures/in-memory-creator-tag-repository';
import { NOW, approvedTag, pendingTag, rejectedTag } from '../../fixtures/creator-tags';

const USER = 'user-1';
const OTHER = 'user-2';
const IG = CreatorPlatform.Instagram;
const TT = CreatorPlatform.TikTok;
const IG_TAG = InMemoryCreatorTagRepository.tagId(USER, IG);
const approve = { tagId: IG_TAG, decision: CreatorStatus.Approved } as const;
const reject = { tagId: IG_TAG, decision: CreatorStatus.Rejected } as const;

function review(repo: InMemoryCreatorTagRepository, notifications: NotificationService | null = null): ReviewCreatorTagUseCase {
  return new ReviewCreatorTagUseCase(repo, notifications, () => NOW);
}

function notifier(): NotificationService & { notify: jest.Mock } {
  return { notify: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationService & { notify: jest.Mock };
}

describe('ReviewCreatorTagUseCase', () => {
  it('approves a pending claim and stamps the review time', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada'));

    const result = await review(repo).execute(approve);

    expect(result.ok).toBe(true);
    expect(repo.tag(USER, IG)?.status).toBe(CreatorStatus.Approved);
    expect(repo.tag(USER, IG)?.reviewedAt).toBe(NOW);
  });

  it('rejects a pending claim and stamps the review time', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada'));

    const result = await review(repo).execute(reject);

    expect(result.ok).toBe(true);
    expect(repo.tag(USER, IG)?.status).toBe(CreatorStatus.Rejected);
    expect(repo.tag(USER, IG)?.reviewedAt).toBe(NOW);
  });

  it('reviews one platform and leaves the user\'s other tag as it was', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada'), pendingTag('ada_tt', TT));

    await review(repo).execute({ tagId: InMemoryCreatorTagRepository.tagId(USER, TT), decision: CreatorStatus.Approved });

    expect(repo.tag(USER, TT)?.status).toBe(CreatorStatus.Approved);
    expect(repo.tag(USER, IG)?.status).toBe(CreatorStatus.Pending);
  });

  it('lets a user hold approved tags on both platforms at once', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, approvedTag('ada'), pendingTag('ada', TT));

    const result = await review(repo).execute({ tagId: InMemoryCreatorTagRepository.tagId(USER, TT), decision: CreatorStatus.Approved });

    expect(result.ok).toBe(true);
    expect(repo.tag(USER, IG)?.isApproved).toBe(true);
    expect(repo.tag(USER, TT)?.isApproved).toBe(true);
  });

  it.each([
    [CreatorStatus.Approved, 'creator_approved'],
    [CreatorStatus.Rejected, 'creator_rejected'],
  ] as const)('notifies the owner of a %s decision with the platform and handle', async (decision, type) => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada_tt', TT));
    const notifications = notifier();

    await review(repo, notifications).execute({ tagId: InMemoryCreatorTagRepository.tagId(USER, TT), decision });

    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: USER, type, sourcePlatform: TT, sourceHandle: 'ada_tt' }),
    );
  });

  it('sends no notification when the review is refused', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, approvedTag('ada'));
    const notifications = notifier();

    await review(repo, notifications).execute(reject);

    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('refuses approval with creator_handle_taken when another user holds the handle approved', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(OTHER, approvedTag('ada')).seed(USER, pendingTag('@ADA'));

    const result = await review(repo).execute(approve);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.messageKey).toBe('errors.conflict.creator_handle_taken');
    expect(repo.tag(USER, IG)?.status).toBe(CreatorStatus.Pending);
  });

  it('approves when the other holder has the same handle on a different platform', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(OTHER, approvedTag('ada', TT)).seed(USER, pendingTag('ada', IG));
    expect((await review(repo).execute(approve)).ok).toBe(true);
  });

  it('approves when the other claim on the handle is only pending', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(OTHER, pendingTag('ada')).seed(USER, pendingTag('ada'));
    expect((await review(repo).execute(approve)).ok).toBe(true);
  });

  it('can still reject a claim whose handle someone else holds', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(OTHER, approvedTag('ada')).seed(USER, pendingTag('ada'));
    expect((await review(repo).execute(reject)).ok).toBe(true);
  });

  it('reports the store refusing a racing second approval as creator_handle_taken', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada'));
    jest.spyOn(repo, 'saveReview').mockResolvedValue(fail(new ConflictFailure('errors.conflict.creator_handle_taken')));

    const result = await review(repo).execute(approve);

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_handle_taken');
  });

  // The admin opened a pending @ada; before they clicked Approve the user
  // changed it to @ada2 (pending again) — the approval must not land on @ada2.
  it('refuses with creator_not_pending when the user changed the claim between read and write', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada2'));
    jest.spyOn(repo, 'findById').mockResolvedValueOnce(ok({ userId: USER, tag: pendingTag('ada') }));

    const result = await review(repo).execute(approve);

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    expect(repo.tag(USER, IG)?.handle).toBe('ada2');
    expect(repo.tag(USER, IG)?.status).toBe(CreatorStatus.Pending);
  });

  it('refuses with creator_not_pending when the user withdrew the claim between read and write', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER);
    jest.spyOn(repo, 'findById').mockResolvedValueOnce(ok({ userId: USER, tag: pendingTag('ada') }));

    const result = await review(repo).execute(reject);

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    expect(repo.tag(USER, IG)).toBeNull();
  });

  // The admin opened pending @ada; the user withdrew it and claimed @ada again.
  // Same platform + handle, but a new claim the admin has not looked at.
  it('refuses with creator_not_pending after a withdraw + re-request of the same handle', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, CreatorTag.request(pendingTag('ada').account, NOW, null));
    jest.spyOn(repo, 'findById').mockResolvedValueOnce(ok({ userId: USER, tag: pendingTag('ada') }));

    const result = await review(repo).execute(approve);

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    expect(repo.tag(USER, IG)?.status).toBe(CreatorStatus.Pending);
  });

  it('refuses an unknown tag id (or a deleted owner\'s) with creator_not_pending', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada'));
    const result = await review(repo).execute({ tagId: 'missing', decision: CreatorStatus.Approved });
    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    expect(repo.saves).toBe(0);
  });

  it.each([
    ['an approved claim', approvedTag()],
    ['a rejected claim', rejectedTag()],
  ])('refuses to review %s with creator_not_pending', async (_label, tag) => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, tag);
    for (const input of [approve, reject]) {
      const result = await review(repo).execute(input);
      expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    }
    expect(repo.saves).toBe(0);
  });
});
