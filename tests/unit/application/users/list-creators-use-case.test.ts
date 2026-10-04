import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorHandle } from '@domain/users/creator-handle';
import type { UserProfileRepositoryInterface } from '@application/users/ports/user-profile-repository-interface';
import { ListCreatorsUseCase } from '@application/users/use-cases/list-creators-use-case';

function handle(platform: CreatorPlatform, raw: string): CreatorHandle {
  const result = CreatorHandle.create(platform, raw);
  if (!result.ok) throw new Error('fixture handle invalid');
  return result.value;
}

function makeRepo(): UserProfileRepositoryInterface & { listCreators: jest.Mock } {
  return {
    getProfile: jest.fn(),
    listCreators: jest.fn(async (page: number, pageSize: number) =>
      ok({
        items: [
          {
            id: 'u1',
            displayName: 'Ada',
            photoUrl: null,
            creatorTags: [handle(CreatorPlatform.Instagram, 'ada.cooks'), handle(CreatorPlatform.TikTok, 'ada')],
            recipeCount: 3,
            followerCount: 10,
          },
        ],
        total: 1,
        page,
        pageSize,
      }),
    ),
  };
}

describe('ListCreatorsUseCase', () => {
  it('defaults to page 1 and a page size of 20', async () => {
    const repo = makeRepo();
    await new ListCreatorsUseCase(repo).execute({});
    expect(repo.listCreators).toHaveBeenCalledWith(1, 20);
  });

  it('caps the page size at 50 instead of refusing', async () => {
    const repo = makeRepo();
    const result = await new ListCreatorsUseCase(repo).execute({ page: 2, pageSize: 500 });
    expect(repo.listCreators).toHaveBeenCalledWith(2, 50);
    expect(result.ok && result.value.pageSize).toBe(50);
  });

  it('keeps a page size under the cap', async () => {
    const repo = makeRepo();
    await new ListCreatorsUseCase(repo).execute({ pageSize: 7 });
    expect(repo.listCreators).toHaveBeenCalledWith(1, 7);
  });

  it('answers the contract shape: every approved tag nested, counts beside them', async () => {
    const result = await new ListCreatorsUseCase(makeRepo()).execute({});
    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            id: 'u1',
            displayName: 'Ada',
            photoUrl: null,
            creatorTags: [
              { platform: CreatorPlatform.Instagram, handle: 'ada.cooks' },
              { platform: CreatorPlatform.TikTok, handle: 'ada' },
            ],
            recipeCount: 3,
            followerCount: 10,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    });
  });

  it('passes a repository failure through', async () => {
    const repo = makeRepo();
    repo.listCreators.mockResolvedValue(fail(new UnknownFailure('db down')));
    expect((await new ListCreatorsUseCase(repo).execute({})).ok).toBe(false);
  });
});
