import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import {
  GetUserProfileUseCase,
  type GetUserProfileInput,
} from '@application/users/use-cases/get-user-profile-use-case';
import type { IUserProfileRepository, UserProfileData } from '@application/users/ports/i-user-profile-repository';

// ---- fixtures ---------------------------------------------------------------

const USER_ID = 'profile-owner-uuid';
const CURRENT_USER_ID = 'viewer-uuid';

function makeProfileData(overrides: Partial<UserProfileData> = {}): UserProfileData {
  return {
    id: USER_ID,
    displayName: 'Ada Lovelace',
    bio: 'I write algorithms.',
    photoUrl: 'https://example.com/ada.jpg',
    recipeCount: 3,
    totalLikes: 12,
    totalViews: 200,
    followerCount: 5,
    followingCount: 2,
    isFollowedByMe: false,
    joinedAt: new Date('2024-05-01T00:00:00Z'),
    ...overrides,
  };
}

function makeInput(overrides: Partial<GetUserProfileInput> = {}): GetUserProfileInput {
  return {
    userId: USER_ID,
    ...overrides,
  };
}

interface RepoOptions {
  getProfileResult?: Result<UserProfileData, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IUserProfileRepository;
  getProfileCalls: () => Array<[string, string | undefined]>;
} {
  const getProfileCalls: Array<[string, string | undefined]> = [];

  const repo: IUserProfileRepository = {
    async getProfile(userId: string, currentUserId?: string): Promise<Result<UserProfileData, Failure>> {
      getProfileCalls.push([userId, currentUserId]);
      return options.getProfileResult ?? ok(makeProfileData());
    },
  };

  return { repo, getProfileCalls: () => getProfileCalls };
}

// ---- tests ------------------------------------------------------------------

describe('GetUserProfileUseCase — happy path', () => {
  it('returns the mapped profile DTO on success', async () => {
    const { repo } = makeRepo({ getProfileResult: ok(makeProfileData()) });
    const useCase = new GetUserProfileUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: USER_ID,
      displayName: 'Ada Lovelace',
      bio: 'I write algorithms.',
      photoUrl: 'https://example.com/ada.jpg',
      recipeCount: 3,
      totalLikes: 12,
      totalViews: 200,
      followerCount: 5,
      followingCount: 2,
      isFollowedByMe: false,
      joinedAt: '2024-05-01T00:00:00.000Z',
    });
  });

  it('serializes joinedAt to an ISO string', async () => {
    const { repo } = makeRepo({
      getProfileResult: ok(makeProfileData({ joinedAt: new Date('2023-11-15T08:30:00Z') })),
    });
    const useCase = new GetUserProfileUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.joinedAt).toBe('2023-11-15T08:30:00.000Z');
  });
});

describe('GetUserProfileUseCase — currentUserId forwarding (exactOptionalPropertyTypes)', () => {
  it('forwards currentUserId to the repository when provided', async () => {
    const { repo, getProfileCalls } = makeRepo();
    const useCase = new GetUserProfileUseCase(repo);

    await useCase.execute(makeInput({ currentUserId: CURRENT_USER_ID }));

    expect(getProfileCalls()).toEqual([[USER_ID, CURRENT_USER_ID]]);
  });

  it('calls getProfile with only userId when currentUserId is absent', async () => {
    const { repo, getProfileCalls } = makeRepo();
    const useCase = new GetUserProfileUseCase(repo);

    await useCase.execute(makeInput());

    expect(getProfileCalls()).toEqual([[USER_ID, undefined]]);
  });

  it('reflects isFollowedByMe as returned by the repository for the current viewer', async () => {
    const { repo } = makeRepo({ getProfileResult: ok(makeProfileData({ isFollowedByMe: true })) });
    const useCase = new GetUserProfileUseCase(repo);

    const result = await useCase.execute(makeInput({ currentUserId: CURRENT_USER_ID }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isFollowedByMe).toBe(true);
  });
});

describe('GetUserProfileUseCase — profile of nonexistent user', () => {
  it('returns NotFoundFailure when the repository reports the user does not exist', async () => {
    const { repo } = makeRepo({ getProfileResult: fail(new NotFoundFailure('errors.user.not_found')) });
    const useCase = new GetUserProfileUseCase(repo);

    const result = await useCase.execute(makeInput({ userId: 'nonexistent-uuid' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('GetUserProfileUseCase — repository failure', () => {
  it('propagates the failure when the repository fails unexpectedly', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo } = makeRepo({ getProfileResult: fail(repoFailure) });
    const useCase = new GetUserProfileUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
