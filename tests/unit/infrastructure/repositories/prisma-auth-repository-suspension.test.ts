import type { PrismaClient } from '@prisma/client';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { NotFoundFailure, UnknownFailure } from '@core/failure';

// getAccountStatus backs EnsureAccountActiveUseCase, which runs on every
// authenticated request — it must read both flags in one query. suspendUser
// and unsuspendUser must only ever touch a live (non-deleted) row, mirroring
// the same `deletedAt: null` guard every other mutating auth-repo method uses.

const USER_ID = 'user-1';

function makePrisma(overrides: {
  findFirstResult?: unknown;
  updateManyCount?: number;
  throwOn?: 'findFirst' | 'updateMany';
} = {}): { prisma: PrismaClient; findFirst: jest.Mock; updateMany: jest.Mock } {
  const findFirst = overrides.throwOn === 'findFirst'
    ? jest.fn().mockRejectedValue(new Error('db down'))
    : jest.fn().mockResolvedValue(overrides.findFirstResult ?? null);
  const updateMany = overrides.throwOn === 'updateMany'
    ? jest.fn().mockRejectedValue(new Error('db down'))
    : jest.fn().mockResolvedValue({ count: overrides.updateManyCount ?? 1 });

  const prisma = { user: { findFirst, updateMany } } as unknown as PrismaClient;
  return { prisma, findFirst, updateMany };
}

describe('PrismaAuthRepository suspension', () => {
  describe('getAccountStatus', () => {
    it('returns the deletedAt/suspendedAt pair for an existing user', async () => {
      const { prisma } = makePrisma({ findFirstResult: { deletedAt: null, suspendedAt: null } });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.getAccountStatus(USER_ID);

      expect(result).toEqual({ ok: true, value: { deletedAt: null, suspendedAt: null } });
    });

    it('returns null when no user exists with that id', async () => {
      const { prisma } = makePrisma({ findFirstResult: null });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.getAccountStatus(USER_ID);

      expect(result).toEqual({ ok: true, value: null });
    });

    it('wraps a database error as UnknownFailure', async () => {
      const { prisma } = makePrisma({ throwOn: 'findFirst' });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.getAccountStatus(USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBeInstanceOf(UnknownFailure);
    });
  });

  describe('suspendUser', () => {
    it('stamps suspendedAt and stores the reason, scoped to a live account', async () => {
      const { prisma, updateMany } = makePrisma({ updateManyCount: 1 });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.suspendUser(USER_ID, 'spamming comments');

      expect(result).toEqual({ ok: true, value: undefined });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID, deletedAt: null },
        data: { suspendedAt: expect.any(Date), suspensionReason: 'spamming comments' },
      });
    });

    it('accepts a null reason', async () => {
      const { prisma, updateMany } = makePrisma({ updateManyCount: 1 });
      const repo = new PrismaAuthRepository(prisma);

      await repo.suspendUser(USER_ID, null);

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ suspensionReason: null }) }),
      );
    });

    it('returns NotFoundFailure when the account is already deleted or does not exist', async () => {
      const { prisma } = makePrisma({ updateManyCount: 0 });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.suspendUser(USER_ID, null);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBeInstanceOf(NotFoundFailure);
    });

    it('wraps a database error as UnknownFailure', async () => {
      const { prisma } = makePrisma({ throwOn: 'updateMany' });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.suspendUser(USER_ID, null);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBeInstanceOf(UnknownFailure);
    });
  });

  describe('unsuspendUser', () => {
    it('clears suspendedAt and suspensionReason', async () => {
      const { prisma, updateMany } = makePrisma({ updateManyCount: 1 });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.unsuspendUser(USER_ID);

      expect(result).toEqual({ ok: true, value: undefined });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID, deletedAt: null },
        data: { suspendedAt: null, suspensionReason: null },
      });
    });

    it('returns NotFoundFailure when the account is already deleted or does not exist', async () => {
      const { prisma } = makePrisma({ updateManyCount: 0 });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.unsuspendUser(USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBeInstanceOf(NotFoundFailure);
    });
  });
});
