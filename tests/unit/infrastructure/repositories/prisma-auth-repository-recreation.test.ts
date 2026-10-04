import type { PrismaClient } from '@prisma/client';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { emailFingerprint } from '@infrastructure/security/email-fingerprint';
import { Email } from '@domain/common/email';

// Signing up again with an address that once had an account must produce a NEW
// account — never a revival of the tombstone — and must leave a RECREATED row
// linking the new id back to the old one. These tests pin both halves, plus the
// `deletedAt: null` guard that keeps a tombstone from being treated as "taken".

const EMAIL = 'chef@example.com';
const OLD_USER_ID = 'old-user-1';
const NEW_USER_ID = 'new-user-2';

function email(): Email {
  const result = Email.create(EMAIL);
  if (!result.ok) throw new Error('fixture email must be valid');
  return result.value;
}

function makePrisma(previousDeletion: { userId: string } | null): {
  prisma: PrismaClient;
  userCreate: jest.Mock;
  userFindFirst: jest.Mock;
  logFindFirst: jest.Mock;
  logCreate: jest.Mock;
} {
  const userCreate = jest.fn().mockResolvedValue({
    id: NEW_USER_ID,
    email: EMAIL,
    displayName: 'Chef',
    bio: null,
    photoUrl: null,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    creatorTags: [],
  });
  const userFindFirst = jest.fn().mockResolvedValue(null);
  const logFindFirst = jest.fn().mockResolvedValue(previousDeletion);
  const logCreate = jest.fn().mockResolvedValue({ id: 'log-1' });

  const tx = {
    user: { create: userCreate, findFirst: userFindFirst },
    accountEventLog: { findFirst: logFindFirst, create: logCreate },
  };
  const prisma = {
    user: { create: userCreate, findFirst: userFindFirst },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaClient;

  return { prisma, userCreate, userFindFirst, logFindFirst, logCreate };
}

describe('PrismaAuthRepository.createUser — signing up again after deletion', () => {
  it('creates a brand-new account and links it to the tombstone with a RECREATED log row', async () => {
    const { prisma, userCreate, logCreate } = makePrisma({ userId: OLD_USER_ID });
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.createUser({ email: email(), passwordHash: 'hash', displayName: 'Chef' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(NEW_USER_ID);
      expect(result.value.id).not.toBe(OLD_USER_ID);
    }
    // A plain insert — the deleted row is never updated back into service.
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(logCreate).toHaveBeenCalledWith({
      data: {
        event: 'RECREATED',
        userId: NEW_USER_ID,
        emailHash: emailFingerprint(EMAIL),
        previousUserId: OLD_USER_ID,
      },
    });
  });

  it('logs nothing extra for a first-time signup', async () => {
    const { prisma, logCreate } = makePrisma(null);
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.createUser({ email: email(), passwordHash: 'hash', displayName: 'Chef' });

    expect(result.ok).toBe(true);
    expect(logCreate).not.toHaveBeenCalled();
  });

  it('matches the prior deletion on the DELETED event, most recent first', async () => {
    const { prisma, logFindFirst } = makePrisma({ userId: OLD_USER_ID });
    const repo = new PrismaAuthRepository(prisma);

    await repo.createUser({ email: email(), passwordHash: 'hash', displayName: 'Chef' });

    expect(logFindFirst).toHaveBeenCalledWith({
      where: { event: 'DELETED', emailHash: emailFingerprint(EMAIL) },
      orderBy: { createdAt: 'desc' },
      select: { userId: true },
    });
  });
});

describe('PrismaAuthRepository — tombstones are invisible to lookups', () => {
  it('existsByEmail ignores a deleted account, so its address counts as free', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { user: { count } } as unknown as PrismaClient;
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.existsByEmail(email());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
    expect(count).toHaveBeenCalledWith({ where: { email: EMAIL, deletedAt: null } });
  });

  it('findCredentialsByEmail filters out tombstones, so a deleted account cannot log in', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { user: { findFirst } } as unknown as PrismaClient;
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.findCredentialsByEmail(email());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: EMAIL, deletedAt: null } }));
  });

  it('isActive reports false once the account is tombstoned', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { user: { count } } as unknown as PrismaClient;
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.isActive(OLD_USER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
    expect(count).toHaveBeenCalledWith({ where: { id: OLD_USER_ID, deletedAt: null } });
  });
});
