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

const IG = CreatorPlatform.Instagram;
const TT = CreatorPlatform.TikTok;

function repoWith(...creatorTags: CreatorTag[]): UserProfileRepositoryInterface & { getProfile: jest.Mock } {
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
    creatorTags,
  };
  return { getProfile: jest.fn().mockResolvedValue(ok(data)), listCreators: jest.fn() };
}

// A pending or rejected handle is the owner's business only: another user
// must never see an unreviewed claim.
describe('creator tags on the public profile (GET /users/:id)', () => {
  it('shows an approved claim as platform + handle', async () => {
    const result = await new GetUserProfileUseCase(repoWith(approvedTag('ada'))).execute({ userId: 'u1' });
    expect(result.ok && result.value.creatorTags).toEqual([{ platform: IG, handle: 'ada' }]);
  });

  it('shows both platforms when both are approved, ordered by platform', async () => {
    const result = await new GetUserProfileUseCase(repoWith(approvedTag('ada_tt', TT), approvedTag('ada'))).execute({ userId: 'u1' });
    expect(result.ok && result.value.creatorTags).toEqual([
      { platform: IG, handle: 'ada' },
      { platform: TT, handle: 'ada_tt' },
    ]);
  });

  it('shows the approved platform and hides the pending one', async () => {
    const result = await new GetUserProfileUseCase(repoWith(approvedTag('ada'), pendingTag('ada', TT))).execute({ userId: 'u1' });
    expect(result.ok && result.value.creatorTags).toEqual([{ platform: IG, handle: 'ada' }]);
  });

  it.each([
    ['pending', [pendingTag()]],
    ['rejected', [rejectedTag()]],
    ['absent', []],
  ])('is empty for a %s claim', async (_label, tags) => {
    const result = await new GetUserProfileUseCase(repoWith(...tags)).execute({ userId: 'u1' });
    expect(result.ok && result.value.creatorTags).toEqual([]);
  });
});

describe('creator tags on the own profile (GET /me)', () => {
  it.each([
    [CreatorStatus.Pending, pendingTag()],
    [CreatorStatus.Approved, approvedTag()],
    [CreatorStatus.Rejected, rejectedTag()],
  ])('shows a %s claim with its status', async (status, tag) => {
    const result = await new GetMyProfileUseCase(repoWith(tag)).execute('u1');
    expect(result.ok && result.value.creatorTags).toEqual([{ platform: IG, handle: 'ada', status }]);
  });

  it('shows every platform with its own status', async () => {
    const result = await new GetMyProfileUseCase(repoWith(rejectedTag('ada_tt', TT), approvedTag('ada'))).execute('u1');
    expect(result.ok && result.value.creatorTags).toEqual([
      { platform: IG, handle: 'ada', status: CreatorStatus.Approved },
      { platform: TT, handle: 'ada_tt', status: CreatorStatus.Rejected },
    ]);
  });

  it('is empty with no claim', async () => {
    const result = await new GetMyProfileUseCase(repoWith()).execute('u1');
    expect(result.ok && result.value.creatorTags).toEqual([]);
  });

  it('asks the repository as the owner', async () => {
    const repo = repoWith();
    await new GetMyProfileUseCase(repo).execute('u1');
    expect(repo.getProfile).toHaveBeenCalledWith('u1', 'u1');
  });
});

describe('creator tags on the signed-in user (UserDto: login, PATCH /me/profile, avatar)', () => {
  function user(...creatorTags: CreatorTag[]): User {
    const email = Email.create('ada@example.com');
    if (!email.ok) throw new Error('unreachable');
    const result = User.create({
      id: 'u1',
      email: email.value,
      displayName: 'Ada',
      photoUrl: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      creatorTags,
    });
    if (!result.ok) throw new Error('unreachable');
    return result.value;
  }

  it('carries the owner view of every claim', () => {
    expect(UserMapper.toDto(user(pendingTag('ada_tt', TT), approvedTag())).creatorTags).toEqual([
      { platform: IG, handle: 'ada', status: CreatorStatus.Approved },
      { platform: TT, handle: 'ada_tt', status: CreatorStatus.Pending },
    ]);
  });

  it('is empty with no claim', () => {
    expect(UserMapper.toDto(user()).creatorTags).toEqual([]);
  });
});
