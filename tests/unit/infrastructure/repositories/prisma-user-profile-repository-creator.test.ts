import type { PrismaClient } from '@prisma/client';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { PrismaUserProfileRepository } from '@infrastructure/repositories/users/prisma-user-profile-repository';

const OWNER = 'owner-1';

function makePrisma(row: Record<string, unknown> | null): { prisma: PrismaClient; findFirst: jest.Mock } {
  const findFirst = jest.fn().mockResolvedValue(row);
  const prisma = {
    user: { findFirst },
    userFollow: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn() },
    recipe: { count: jest.fn(), aggregate: jest.fn() },
    recipeLike: { count: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([1, 0, { _sum: { viewCount: 0 } }, 0, 0]),
  } as unknown as PrismaClient;
  return { prisma, findFirst };
}

function row(creator: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: OWNER,
    displayName: 'Ada',
    bio: null,
    photoUrl: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    creatorStatus: CreatorStatus.None,
    creatorPlatform: null,
    creatorHandle: null,
    creatorRequestedAt: null,
    creatorReviewedAt: null,
    ...creator,
  };
}

// The creator page is public now; a suspended account must not be, exactly as
// it is left out of GET /users/creators.
describe('PrismaUserProfileRepository.getProfile — suspended accounts', () => {
  it('hides a suspended account from a guest', async () => {
    const { prisma, findFirst } = makePrisma(null);

    const result = await new PrismaUserProfileRepository(prisma).getProfile(OWNER);

    expect(findFirst.mock.calls[0][0].where).toEqual({ id: OWNER, deletedAt: null, suspendedAt: null });
    expect(!result.ok && result.failure.code).toBe('not_found');
  });

  it('hides a suspended account from another signed-in user', async () => {
    const { prisma, findFirst } = makePrisma(null);
    await new PrismaUserProfileRepository(prisma).getProfile(OWNER, 'viewer');
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: OWNER, deletedAt: null, suspendedAt: null });
  });

  it('still shows the owner their own profile (GET /me)', async () => {
    const { prisma, findFirst } = makePrisma(row());
    const result = await new PrismaUserProfileRepository(prisma).getProfile(OWNER, OWNER);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: OWNER, deletedAt: null });
    expect(result.ok).toBe(true);
  });
});

describe('PrismaUserProfileRepository.getProfile — creator claim', () => {
  it('reads a valid claim', async () => {
    const { prisma } = makePrisma(
      row({
        creatorStatus: CreatorStatus.Approved,
        creatorPlatform: CreatorPlatform.Instagram,
        creatorHandle: 'ada',
        creatorRequestedAt: new Date(),
        creatorReviewedAt: new Date(),
      }),
    );
    const result = await new PrismaUserProfileRepository(prisma).getProfile(OWNER);
    expect(result.ok && result.value.creatorTag?.handle).toBe('ada');
  });

  it('serves the profile with no claim when the stored one no longer passes the rules', async () => {
    const { prisma } = makePrisma(
      row({ creatorStatus: CreatorStatus.Approved, creatorPlatform: CreatorPlatform.Instagram, creatorHandle: 'bad..handle', creatorRequestedAt: new Date() }),
    );
    const result = await new PrismaUserProfileRepository(prisma).getProfile(OWNER);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.creatorTag).toBeNull();
  });
});
