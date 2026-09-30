import { RemoveCreatorTagUseCase } from '@application/users/use-cases/remove-creator-tag-use-case';
import { InMemoryCreatorTagRepository } from '../../fixtures/in-memory-creator-tag-repository';
import { approvedTag, pendingTag } from '../../fixtures/creator-tags';

describe('RemoveCreatorTagUseCase', () => {
  it.each([
    ['an approved', approvedTag()],
    ['a pending', pendingTag()],
  ])('clears %s claim', async (_label, tag) => {
    const repo = new InMemoryCreatorTagRepository().seed('user-1', tag);
    const result = await new RemoveCreatorTagUseCase(repo).execute('user-1');
    expect(result.ok).toBe(true);
    expect(repo.tags.get('user-1')).toBeNull();
  });

  it('succeeds when there is no claim', async () => {
    const repo = new InMemoryCreatorTagRepository().seed('user-1');
    expect((await new RemoveCreatorTagUseCase(repo).execute('user-1')).ok).toBe(true);
  });

  it('passes through NotFound for no such user', async () => {
    const result = await new RemoveCreatorTagUseCase(new InMemoryCreatorTagRepository()).execute('ghost');
    expect(!result.ok && result.failure.code).toBe('not_found');
  });
});
