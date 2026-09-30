import { ModerationStatus } from '@domain/moderation/moderation-status';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { RequestCreatorTagUseCase } from '@application/users/use-cases/request-creator-tag-use-case';
import { InMemoryCreatorTagRepository } from '../../fixtures/in-memory-creator-tag-repository';
import { NOW, REQUESTED_AT, approvedTag, approvingModerator, pendingTag, rejectedTag } from '../../fixtures/creator-tags';

const USER = 'user-1';

function setup(seed = pendingTag('old')) {
  const repo = new InMemoryCreatorTagRepository().seed(USER, seed);
  const moderator = approvingModerator();
  const useCase = new RequestCreatorTagUseCase(repo, moderator, () => NOW);
  return { repo, moderator, useCase };
}

describe('RequestCreatorTagUseCase', () => {
  it('stores a first claim as pending, normalised, and answers the owner view', async () => {
    const { repo, useCase } = setup();
    repo.seed(USER, null);

    const result = await useCase.execute({ userId: USER, platform: CreatorPlatform.Instagram, handle: '@Ada.Cooks' });

    expect(result).toEqual({
      ok: true,
      value: { platform: CreatorPlatform.Instagram, handle: 'ada.cooks', status: CreatorStatus.Pending },
    });
    expect(repo.tags.get(USER)?.requestedAt).toBe(NOW);
  });

  it('is a no-op on the same platform + handle as the approved claim — stays approved, nothing written', async () => {
    const { repo, useCase } = setup(approvedTag('ada'));

    const result = await useCase.execute({ userId: USER, platform: CreatorPlatform.Instagram, handle: 'ADA' });

    expect(result.ok && result.value.status).toBe(CreatorStatus.Approved);
    expect(repo.saves).toBe(0);
  });

  it('puts an approved claim back to pending when the handle changes', async () => {
    const { repo, useCase } = setup(approvedTag('ada'));

    const result = await useCase.execute({ userId: USER, platform: CreatorPlatform.Instagram, handle: 'ada2' });

    expect(result.ok && result.value.status).toBe(CreatorStatus.Pending);
    expect(repo.tags.get(USER)?.reviewedAt).toBeNull();
  });

  it('puts an approved claim back to pending when the platform changes', async () => {
    const { useCase } = setup(approvedTag('ada'));
    const result = await useCase.execute({ userId: USER, platform: CreatorPlatform.TikTok, handle: 'ada' });
    expect(result.ok && result.value).toEqual({ platform: CreatorPlatform.TikTok, handle: 'ada', status: CreatorStatus.Pending });
  });

  it('lets a rejected claim be requested again', async () => {
    const { repo, useCase } = setup(rejectedTag('ada'));

    const result = await useCase.execute({ userId: USER, platform: CreatorPlatform.Instagram, handle: 'ada' });

    expect(result.ok && result.value.status).toBe(CreatorStatus.Pending);
    expect(repo.tags.get(USER)?.requestedAt).toBe(NOW);
    expect(repo.tags.get(USER)?.requestedAt).not.toBe(REQUESTED_AT);
  });

  it('answers errors.validation.creator_handle for a bad handle and writes nothing', async () => {
    const { repo, moderator, useCase } = setup();

    const result = await useCase.execute({ userId: USER, platform: CreatorPlatform.TikTok, handle: 'a' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.messageKey).toBe('errors.validation.creator_handle');
    expect(moderator.moderate).not.toHaveBeenCalled();
    expect(repo.saves).toBe(0);
  });

  it('runs the normalised handle through the content moderator like a bio', async () => {
    const { moderator, useCase } = setup();
    await useCase.execute({ userId: USER, platform: CreatorPlatform.Instagram, handle: '@Ada' });
    expect(moderator.moderate).toHaveBeenCalledWith({ text: 'ada', context: 'general' });
  });

  it('refuses a handle the moderator rejects, with the content_blocked key', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER);
    const moderator: ContentModeratorInterface = {
      moderate: () => ({ status: ModerationStatus.Rejected, hit: { category: 'profanity', term: 'x' } }),
    };
    const result = await new RequestCreatorTagUseCase(repo, moderator, () => NOW).execute({
      userId: USER,
      platform: CreatorPlatform.Instagram,
      handle: 'rude',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.messageKey).toBe('errors.validation.content_blocked');
    expect(repo.saves).toBe(0);
  });

  it('passes through NotFound for a user that does not exist', async () => {
    const repo = new InMemoryCreatorTagRepository();
    const result = await new RequestCreatorTagUseCase(repo, approvingModerator(), () => NOW).execute({
      userId: 'ghost',
      platform: CreatorPlatform.Instagram,
      handle: 'ada',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe('not_found');
  });
});
