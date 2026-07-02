import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { FollowUserUseCase, type FollowUserInput } from '@application/users/use-cases/follow-user-use-case';
import type { IUserFollowRepository } from '@domain/users/i-user-follow-repository';
import type { NotificationService } from '@application/notifications/notification-service';

// ---- fixtures ---------------------------------------------------------------

const FOLLOWER = 'follower-uuid';
const FOLLOWING = 'following-uuid';

function makeInput(overrides: Partial<FollowUserInput> = {}): FollowUserInput {
  return {
    followerId: FOLLOWER,
    followingId: FOLLOWING,
    ...overrides,
  };
}

interface RepoOptions {
  isFollowingResult?: Result<boolean, Failure>;
  followResult?: Result<void, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IUserFollowRepository;
  followCalls: () => Array<{ followerId: string; followingId: string }>;
  isFollowingCalls: () => Array<{ followerId: string; followingId: string }>;
} {
  const followCalls: Array<{ followerId: string; followingId: string }> = [];
  const isFollowingCalls: Array<{ followerId: string; followingId: string }> = [];

  const repo: IUserFollowRepository = {
    followerCount: jest.fn(),
    followingCount: jest.fn(),

    async isFollowing(followerId: string, followingId: string): Promise<Result<boolean, Failure>> {
      isFollowingCalls.push({ followerId, followingId });
      return options.isFollowingResult ?? ok(false);
    },

    async follow(followerId: string, followingId: string): Promise<Result<void, Failure>> {
      followCalls.push({ followerId, followingId });
      return options.followResult ?? ok(undefined);
    },

    async unfollow(): Promise<Result<void, Failure>> {
      return ok(undefined);
    },
  };

  return { repo, followCalls: () => followCalls, isFollowingCalls: () => isFollowingCalls };
}

function makeNotificationService(): { service: NotificationService; notifyCalls: () => unknown[] } {
  const notifyCalls: unknown[] = [];
  const service = {
    notify: jest.fn(async (input: unknown) => {
      notifyCalls.push(input);
      return ok(undefined);
    }),
  } as unknown as NotificationService;
  return { service, notifyCalls: () => notifyCalls };
}

// ---- tests ------------------------------------------------------------------

describe('FollowUserUseCase — happy path', () => {
  it('returns ok when a user follows another user they do not already follow', async () => {
    const { repo } = makeRepo();
    const { service } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('calls repo.follow with the correct follower and following ids', async () => {
    const { repo, followCalls } = makeRepo();
    const { service } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    await useCase.execute(makeInput());

    expect(followCalls()).toEqual([{ followerId: FOLLOWER, followingId: FOLLOWING }]);
  });

  it('sends a follow notification to the followed user', async () => {
    const { repo } = makeRepo();
    const { service, notifyCalls } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    await useCase.execute(makeInput());
    await Promise.resolve();

    expect(notifyCalls()).toHaveLength(1);
    expect(notifyCalls()[0]).toMatchObject({
      recipientId: FOLLOWING,
      type: 'follow',
      senderId: FOLLOWER,
    });
  });
});

describe('FollowUserUseCase — self-follow', () => {
  it('returns ValidationFailure when followerId equals followingId', async () => {
    const { repo } = makeRepo();
    const { service } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    const result = await useCase.execute(makeInput({ followingId: FOLLOWER }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.cannot_follow_self');
  });

  it('does not call repo.isFollowing or repo.follow on self-follow attempt', async () => {
    const { repo, followCalls, isFollowingCalls } = makeRepo();
    const { service } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    await useCase.execute(makeInput({ followingId: FOLLOWER }));

    expect(isFollowingCalls()).toHaveLength(0);
    expect(followCalls()).toHaveLength(0);
  });
});

describe('FollowUserUseCase — double follow', () => {
  it('returns ConflictFailure when the follower already follows the target', async () => {
    const { repo } = makeRepo({ isFollowingResult: ok(true) });
    const { service } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('conflict');
    expect(result.failure.messageKey).toBe('errors.conflict.already_following');
  });

  it('does not call repo.follow when already following', async () => {
    const { repo, followCalls } = makeRepo({ isFollowingResult: ok(true) });
    const { service } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    await useCase.execute(makeInput());

    expect(followCalls()).toHaveLength(0);
  });

  it('does not send a notification when already following', async () => {
    const { repo } = makeRepo({ isFollowingResult: ok(true) });
    const { service, notifyCalls } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    await useCase.execute(makeInput());
    await Promise.resolve();

    expect(notifyCalls()).toHaveLength(0);
  });
});

describe('FollowUserUseCase — repository failures', () => {
  it('propagates the failure when repo.isFollowing fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo } = makeRepo({ isFollowingResult: fail(repoFailure) });
    const { service } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });

  it('propagates the failure when repo.follow fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ followResult: fail(repoFailure) });
    const { service, notifyCalls } = makeNotificationService();
    const useCase = new FollowUserUseCase(repo, service);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
    expect(notifyCalls()).toHaveLength(0);
  });
});
