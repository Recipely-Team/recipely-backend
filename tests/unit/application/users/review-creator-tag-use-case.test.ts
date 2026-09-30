import { fail, ok } from '@core/result/result';
import { ConflictFailure } from '@core/failure';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { ReviewCreatorTagUseCase } from '@application/users/use-cases/review-creator-tag-use-case';
import { InMemoryCreatorTagRepository } from '../../fixtures/in-memory-creator-tag-repository';
import { NOW, approvedTag, pendingTag, rejectedTag } from '../../fixtures/creator-tags';

const USER = 'user-1';
const OTHER = 'user-2';
const approve = { userId: USER, decision: CreatorStatus.Approved } as const;
const reject = { userId: USER, decision: CreatorStatus.Rejected } as const;

describe('ReviewCreatorTagUseCase', () => {
  it('approves a pending claim and stamps the review time', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada'));

    const result = await new ReviewCreatorTagUseCase(repo, () => NOW).execute(approve);

    expect(result.ok).toBe(true);
    expect(repo.tags.get(USER)?.status).toBe(CreatorStatus.Approved);
    expect(repo.tags.get(USER)?.reviewedAt).toBe(NOW);
  });

  it('rejects a pending claim and stamps the review time', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada'));

    const result = await new ReviewCreatorTagUseCase(repo, () => NOW).execute(reject);

    expect(result.ok).toBe(true);
    expect(repo.tags.get(USER)?.status).toBe(CreatorStatus.Rejected);
    expect(repo.tags.get(USER)?.reviewedAt).toBe(NOW);
  });

  it('refuses approval with creator_handle_taken when another user holds the handle approved', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(OTHER, approvedTag('ada')).seed(USER, pendingTag('@ADA'));

    const result = await new ReviewCreatorTagUseCase(repo, () => NOW).execute(approve);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.messageKey).toBe('errors.conflict.creator_handle_taken');
    expect(repo.tags.get(USER)?.status).toBe(CreatorStatus.Pending);
  });

  it('approves when the other holder has the same handle on a different platform', async () => {
    const repo = new InMemoryCreatorTagRepository()
      .seed(OTHER, approvedTag('ada', CreatorPlatform.TikTok))
      .seed(USER, pendingTag('ada', CreatorPlatform.Instagram));
    expect((await new ReviewCreatorTagUseCase(repo, () => NOW).execute(approve)).ok).toBe(true);
  });

  it('approves when the other claim on the handle is only pending', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(OTHER, pendingTag('ada')).seed(USER, pendingTag('ada'));
    expect((await new ReviewCreatorTagUseCase(repo, () => NOW).execute(approve)).ok).toBe(true);
  });

  it('can still reject a claim whose handle someone else holds', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(OTHER, approvedTag('ada')).seed(USER, pendingTag('ada'));
    expect((await new ReviewCreatorTagUseCase(repo, () => NOW).execute(reject)).ok).toBe(true);
  });

  it('reports the store refusing a racing second approval as creator_handle_taken', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada'));
    jest.spyOn(repo, 'saveReview').mockResolvedValue(fail(new ConflictFailure('errors.conflict.creator_handle_taken')));

    const result = await new ReviewCreatorTagUseCase(repo, () => NOW).execute(approve);

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_handle_taken');
  });

  // The admin opened a pending @ada; before they clicked Approve the user
  // changed it to @ada2 (pending again) — the approval must not land on @ada2.
  it('refuses with creator_not_pending when the user changed the claim between read and write', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, pendingTag('ada2'));
    jest.spyOn(repo, 'findByUserId').mockResolvedValueOnce(ok(pendingTag('ada')));

    const result = await new ReviewCreatorTagUseCase(repo, () => NOW).execute(approve);

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    expect(repo.tags.get(USER)?.handle).toBe('ada2');
    expect(repo.tags.get(USER)?.status).toBe(CreatorStatus.Pending);
  });

  it('refuses with creator_not_pending when the user withdrew the claim between read and write', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, null);
    jest.spyOn(repo, 'findByUserId').mockResolvedValueOnce(ok(pendingTag('ada')));

    const result = await new ReviewCreatorTagUseCase(repo, () => NOW).execute(reject);

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    expect(repo.tags.get(USER)).toBeNull();
  });

  it.each([
    ['no claim', null],
    ['an approved claim', approvedTag()],
    ['a rejected claim', rejectedTag()],
  ])('refuses to review %s with creator_not_pending', async (_label, tag) => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, tag);
    for (const input of [approve, reject]) {
      const result = await new ReviewCreatorTagUseCase(repo, () => NOW).execute(input);
      expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    }
    expect(repo.saves).toBe(0);
  });
});
