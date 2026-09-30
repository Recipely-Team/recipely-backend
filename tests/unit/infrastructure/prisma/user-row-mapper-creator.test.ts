import type { User as UserRow } from '@prisma/client';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { UserRowMapper } from '@infrastructure/prisma/mappers/user.row-mapper';

function row(creator: Partial<UserRow>): UserRow {
  return {
    id: 'u1',
    email: 'ada@example.com',
    passwordHash: null,
    displayName: 'Ada',
    bio: null,
    photoUrl: null,
    role: 'user',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    suspendedAt: null,
    suspensionReason: null,
    creatorStatus: CreatorStatus.None,
    creatorPlatform: null,
    creatorHandle: null,
    creatorRequestedAt: null,
    creatorReviewedAt: null,
    ...creator,
  };
}

// A claim stored under rules that have since tightened must not break login
// or /me for that user: the row maps, and the claim reads as none.
describe('UserRowMapper — creator claim', () => {
  it('maps a valid claim onto the user', () => {
    const result = UserRowMapper.toDomain(
      row({ creatorStatus: CreatorStatus.Pending, creatorPlatform: CreatorPlatform.TikTok, creatorHandle: 'ada', creatorRequestedAt: new Date() }),
    );
    expect(result.ok && result.value.creatorTag?.handle).toBe('ada');
  });

  it.each([
    ['a handle that breaks the rules', { creatorHandle: 'a' }],
    ['an unknown platform', { creatorPlatform: 'myspace' }],
    ['an unknown status', { creatorStatus: 'banana' }],
  ])('still maps the user, with no claim, for %s', (_label, override) => {
    const result = UserRowMapper.toDomain(
      row({
        creatorStatus: CreatorStatus.Approved,
        creatorPlatform: CreatorPlatform.TikTok,
        creatorHandle: 'ada',
        creatorRequestedAt: new Date(),
        ...override,
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.creatorTag).toBeNull();
  });
});
