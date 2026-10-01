import type { CreatorTag as CreatorTagRow } from '@prisma/client';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { UserRowMapper, type UserRowWithCreatorTags } from '@infrastructure/prisma/mappers/user.row-mapper';
import { pinoInstance } from '@infrastructure/logger/pino-logger';

function tag(over: Partial<CreatorTagRow> = {}): CreatorTagRow {
  return {
    id: 'tag-1',
    userId: 'u1',
    platform: CreatorPlatform.TikTok,
    handle: 'ada',
    status: CreatorStatus.Approved,
    requestedAt: new Date('2026-09-01T00:00:00Z'),
    reviewedAt: null,
    ...over,
  };
}

function row(creatorTags: CreatorTagRow[]): UserRowWithCreatorTags {
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
    creatorTags,
  };
}

// A claim stored under rules that have since tightened must not break login
// or /me for that user: the row maps, and that one claim is left out.
describe('UserRowMapper — creator tags', () => {
  it('maps every valid claim onto the user', () => {
    const result = UserRowMapper.toDomain(
      row([tag({ status: CreatorStatus.Pending }), tag({ id: 'tag-2', platform: CreatorPlatform.Instagram, handle: 'ada.ig' })]),
    );
    expect(result.ok && result.value.creatorTags.map((t) => t.handle)).toEqual(['ada', 'ada.ig']);
  });

  it('maps a user with no claims to an empty list', () => {
    const result = UserRowMapper.toDomain(row([]));
    expect(result.ok && result.value.creatorTags).toEqual([]);
  });

  it.each([
    ['a handle that breaks the rules', { handle: 'a' }],
    ['an unknown platform', { platform: 'myspace' }],
    ['an unknown status', { status: 'banana' }],
  ])('still maps the user, without that claim, for %s', (_label, override) => {
    const result = UserRowMapper.toDomain(row([tag(override), tag({ id: 'tag-2', platform: CreatorPlatform.Instagram, handle: 'ada.ig' })]));
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.creatorTags.map((t) => t.handle)).toEqual(['ada.ig']);
  });
});

describe('UserRowMapper — an unreadable claim is logged', () => {
  afterEach(() => jest.restoreAllMocks());

  it('warns creator_claim_unreadable with the failure key and field', () => {
    const warn = jest.spyOn(pinoInstance, 'warn').mockImplementation(() => undefined);

    UserRowMapper.toDomain(row([tag({ handle: 'a' })]));

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        creatorStatus: CreatorStatus.Approved,
        creatorPlatform: CreatorPlatform.TikTok,
        messageKey: 'errors.validation.creator_handle',
        field: 'handle',
      }),
      'creator_claim_unreadable',
    );
  });

  it('does not warn for a readable claim', () => {
    const warn = jest.spyOn(pinoInstance, 'warn').mockImplementation(() => undefined);
    UserRowMapper.toDomain(row([tag()]));
    expect(warn).not.toHaveBeenCalled();
  });
});
