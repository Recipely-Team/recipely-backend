import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { RemoveCreatorTagUseCase } from '@application/users/use-cases/remove-creator-tag-use-case';
import { InMemoryCreatorTagRepository } from '../../fixtures/in-memory-creator-tag-repository';
import { approvedTag, pendingTag } from '../../fixtures/creator-tags';

const USER = 'user-1';

describe('RemoveCreatorTagUseCase', () => {
  it.each([
    ['an approved', approvedTag()],
    ['a pending', pendingTag()],
  ])('clears %s claim', async (_label, tag) => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, tag);
    const result = await new RemoveCreatorTagUseCase(repo).execute({ userId: USER, platform: CreatorPlatform.Instagram });
    expect(result.ok).toBe(true);
    expect(repo.tag(USER, CreatorPlatform.Instagram)).toBeNull();
  });

  it('withdraws only the named platform; the other tag keeps its status', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, approvedTag('ada'), approvedTag('ada', CreatorPlatform.TikTok));

    await new RemoveCreatorTagUseCase(repo).execute({ userId: USER, platform: CreatorPlatform.TikTok });

    expect(repo.tag(USER, CreatorPlatform.TikTok)).toBeNull();
    expect(repo.tag(USER, CreatorPlatform.Instagram)?.status).toBe(CreatorStatus.Approved);
  });

  it('succeeds when there is no claim on that platform', async () => {
    const repo = new InMemoryCreatorTagRepository().seed(USER, approvedTag('ada'));
    const result = await new RemoveCreatorTagUseCase(repo).execute({ userId: USER, platform: CreatorPlatform.TikTok });
    expect(result.ok).toBe(true);
    expect(repo.tag(USER, CreatorPlatform.Instagram)).not.toBeNull();
  });

  it('passes through NotFound for no such user', async () => {
    const result = await new RemoveCreatorTagUseCase(new InMemoryCreatorTagRepository()).execute({
      userId: 'ghost',
      platform: CreatorPlatform.Instagram,
    });
    expect(!result.ok && result.failure.code).toBe('not_found');
  });
});
