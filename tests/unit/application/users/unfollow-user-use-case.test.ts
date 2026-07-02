import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { UnfollowUserUseCase, type UnfollowUserInput } from '@application/users/use-cases/unfollow-user-use-case';
import type { IUserFollowRepository } from '@domain/users/i-user-follow-repository';

// ---- fixtures ---------------------------------------------------------------

const FOLLOWER = 'follower-uuid';
const FOLLOWING = 'following-uuid';

function makeInput(overrides: Partial<UnfollowUserInput> = {}): UnfollowUserInput {
  return {
    followerId: FOLLOWER,
    followingId: FOLLOWING,
    ...overrides,
  };
}

interface RepoOptions {
  isFollowingResult?: Result<boolean, Failure>;
  unfollowResult?: Result<void, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IUserFollowRepository;
  unfollowCalls: () => Array<{ followerId: string; followingId: string }>;
} {
  const unfollowCalls: Array<{ followerId: string; followingId: string }> = [];

  const repo: IUserFollowRepository = {
    followerCount: jest.fn(),
    followingCount: jest.fn(),
    follow: jest.fn(),

    async isFollowing(): Promise<Result<boolean, Failure>> {
      return options.isFollowingResult ?? ok(true);
    },

    async unfollow(followerId: string, followingId: string): Promise<Result<void, Failure>> {
      unfollowCalls.push({ followerId, followingId });
      return options.unfollowResult ?? ok(undefined);
    },
  };

  return { repo, unfollowCalls: () => unfollowCalls };
}

// ---- tests ------------------------------------------------------------------

describe('UnfollowUserUseCase — happy path', () => {
  it('returns ok when unfollowing a user that is currently followed', async () => {
    const { repo } = makeRepo({ isFollowingResult: ok(true) });
    const useCase = new UnfollowUserUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('calls repo.unfollow with the correct follower and following ids', async () => {
    const { repo, unfollowCalls } = makeRepo({ isFollowingResult: ok(true) });
    const useCase = new UnfollowUserUseCase(repo);

    await useCase.execute(makeInput());

    expect(unfollowCalls()).toEqual([{ followerId: FOLLOWER, followingId: FOLLOWING }]);
  });
});

describe('UnfollowUserUseCase — not currently following', () => {
  it('returns NotFoundFailure when the follower does not follow the target', async () => {
    const { repo } = makeRepo({ isFollowingResult: ok(false) });
    const useCase = new UnfollowUserUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(result.failure.messageKey).toBe('errors.not_found.follow');
  });

  it('does not call repo.unfollow when not currently following', async () => {
    const { repo, unfollowCalls } = makeRepo({ isFollowingResult: ok(false) });
    const useCase = new UnfollowUserUseCase(repo);

    await useCase.execute(makeInput());

    expect(unfollowCalls()).toHaveLength(0);
  });
});

describe('UnfollowUserUseCase — repository failures', () => {
  it('propagates the failure when repo.isFollowing fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo } = makeRepo({ isFollowingResult: fail(repoFailure) });
    const useCase = new UnfollowUserUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });

  it('propagates the failure when repo.unfollow fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ isFollowingResult: ok(true), unfollowResult: fail(repoFailure) });
    const useCase = new UnfollowUserUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
