import { ok } from '@core/result/result';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import type { CreatorTag } from '@domain/users/creator-tag';
import type { UserProfileData, UserProfileRepositoryInterface } from '@application/users/ports/user-profile-repository-interface';
import { GetUserProfileUseCase } from '@application/users/use-cases/get-user-profile-use-case';
import { GetMyProfileUseCase } from '@application/users/use-cases/get-my-profile-use-case';
import { approvedTag, pendingTag, rejectedTag } from '../../fixtures/creator-tags';
import { User } from '@domain/auth/user';
import { Email } from '@domain/common/email';
import { UserMapper } from '@application/auth/mappers/user.mapper';

function repoWith(creatorTag: CreatorTag | null): UserProfileRepositoryInterface & { getProfile: jest.Mock } {
  const data: UserProfileData = {
    id: 'u1',
    displayName: 'Ada',
    bio: null,
    photoUrl: null,
    recipeCount: 1,
    totalLikes: 0,
    totalViews: 0,
    followerCount: 0,
    followingCount: 0,
    isFollowedByMe: false,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    creatorTag,
  };
  return { getProfile: jest.fn().mockResolvedValue(ok(data)), listCreators: jest.fn() };
}

// A pending or rejected handle is the owner's business only: another user
// must never see an unreviewed claim.
describe('creator on the public profile (GET /users/:id)', () => {
  it('shows an approved claim as platform + handle', async () => {
    const result = await new GetUserProfileUseCase(repoWith(approvedTag('ada'))).execute({ userId: 'u1' });
    expect(result.ok && result.value.creator).toEqual({ platform: CreatorPlatform.Instagram, handle: 'ada' });
  });

  it.each([
    ['pending', pendingTag()],
    ['rejected', rejectedTag()],
    ['absent', null],
  ])('hides a %s claim', async (_label, tag) => {
    const result = await new GetUserProfileUseCase(repoWith(tag)).execute({ userId: 'u1' });
    expect(result.ok && result.value.creator).toBeNull();
  });
});

describe('creator on the own profile (GET /me)', () => {
  it.each([
    [CreatorStatus.Pending, pendingTag()],
    [CreatorStatus.Approved, approvedTag()],
    [CreatorStatus.Rejected, rejectedTag()],
  ])('shows a %s claim with its status', async (status, tag) => {
    const result = await new GetMyProfileUseCase(repoWith(tag)).execute('u1');
    expect(result.ok && result.value.creator).toEqual({ platform: CreatorPlatform.Instagram, handle: 'ada', status });
  });

  it('is null with no claim', async () => {
    const result = await new GetMyProfileUseCase(repoWith(null)).execute('u1');
    expect(result.ok && result.value.creator).toBeNull();
  });

  it('asks the repository as the owner', async () => {
    const repo = repoWith(null);
    await new GetMyProfileUseCase(repo).execute('u1');
    expect(repo.getProfile).toHaveBeenCalledWith('u1', 'u1');
  });
});

describe('creator on the signed-in user (UserDto: login, PATCH /me/profile, avatar)', () => {
  function user(creatorTag?: CreatorTag): User {
    const email = Email.create('ada@example.com');
    if (!email.ok) throw new Error('unreachable');
    const result = User.create({
      id: 'u1',
      email: email.value,
      displayName: 'Ada',
      photoUrl: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...(creatorTag !== undefined ? { creatorTag } : {}),
    });
    if (!result.ok) throw new Error('unreachable');
    return result.value;
  }

  it('carries the owner view of the claim', () => {
    expect(UserMapper.toDto(user(pendingTag())).creator).toEqual({
      platform: CreatorPlatform.Instagram,
      handle: 'ada',
      status: CreatorStatus.Pending,
    });
  });

  it('is null with no claim', () => {
    expect(UserMapper.toDto(user()).creator).toBeNull();
  });
});
