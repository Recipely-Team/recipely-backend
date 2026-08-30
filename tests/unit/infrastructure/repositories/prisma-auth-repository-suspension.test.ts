import type { PrismaClient } from '@prisma/client';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { NotFoundFailure, UnknownFailure } from '@core/failure';

// getAccountStatus backs EnsureAccountActiveUseCase, which runs on every
// authenticated request — it must read both flags in one query. suspendUser
// and unsuspendUser must only ever touch a live (non-deleted) row, mirroring
// the same `deletedAt: null` guard every other mutating auth-repo method uses,
// and each must write its audit row in the SAME transaction as the update: a
// moderation action that could not be logged must not commit.

const USER_ID = 'user-1';
const EMAIL = 'banned@example.com';

interface PrismaMocks {
  prisma: PrismaClient;
  findFirst: jest.Mock;
  updateManyAndReturn: jest.Mock;
  createEvent: jest.Mock;
}

function makePrisma(overrides: {
  findFirstResult?: unknown;
  updatedRows?: unknown[];
  throwOn?: 'findFirst' | 'update' | 'log';
} = {}): PrismaMocks {
  const findFirst = overrides.throwOn === 'findFirst'
    ? jest.fn().mockRejectedValue(new Error('db down'))
    : jest.fn().mockResolvedValue(overrides.findFirstResult ?? null);

  const updateManyAndReturn = overrides.throwOn === 'update'
    ? jest.fn().mockRejectedValue(new Error('db down'))
    : jest.fn().mockResolvedValue(overrides.updatedRows ?? [{ email: EMAIL }]);

  const createEvent = overrides.throwOn === 'log'
    ? jest.fn().mockRejectedValue(new Error('log write failed'))
    : jest.fn().mockResolvedValue({});

  const tx = {
    user: { updateManyAndReturn },
    accountEventLog: { create: createEvent },
  };

  const prisma = {
    user: { findFirst },
    // The real client hands the callback a transaction-scoped client; mirroring
    // that is what lets the tests below assert the log and the update share one.
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaClient;

  return { prisma, findFirst, updateManyAndReturn, createEvent };
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
      const { prisma, updateManyAndReturn } = makePrisma();
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.suspendUser(USER_ID, 'spamming comments');

      expect(result).toEqual({ ok: true, value: undefined });
      expect(updateManyAndReturn).toHaveBeenCalledWith({
        where: { id: USER_ID, deletedAt: null },
        data: { suspendedAt: expect.any(Date), suspensionReason: 'spamming comments' },
        select: { email: true },
      });
    });

    it('records who suspended the account, and why', async () => {
      const { prisma, createEvent } = makePrisma();
      const repo = new PrismaAuthRepository(prisma);

      await repo.suspendUser(USER_ID, 'spamming comments', 'admin-9');

      expect(createEvent).toHaveBeenCalledWith({
        data: expect.objectContaining({
          event: 'SUSPENDED',
          userId: USER_ID,
          actorId: 'admin-9',
          reason: 'spamming comments',
        }),
      });
    });

    it('fingerprints the address so a later re-registration can be linked to the ban', async () => {
      // Ban evasion is the whole point: the address itself is not stored, but
      // the same hash appearing on a later RECREATED row gives it away.
      const { prisma, createEvent } = makePrisma();
      const repo = new PrismaAuthRepository(prisma);

      await repo.suspendUser(USER_ID, null, 'admin-9');

      const written = createEvent.mock.calls[0]?.[0] as { data: { emailHash?: string } };
      expect(written.data.emailHash).toEqual(expect.any(String));
      expect(written.data.emailHash).not.toContain(EMAIL);
    });

    it('accepts a null reason', async () => {
      const { prisma, updateManyAndReturn } = makePrisma();
      const repo = new PrismaAuthRepository(prisma);

      await repo.suspendUser(USER_ID, null);

      expect(updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ suspensionReason: null }) }),
      );
    });

    it('returns NotFoundFailure when the account is already deleted or does not exist', async () => {
      const { prisma, createEvent } = makePrisma({ updatedRows: [] });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.suspendUser(USER_ID, null);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBeInstanceOf(NotFoundFailure);
      expect(createEvent).not.toHaveBeenCalled();
    });

    it('wraps a database error as UnknownFailure', async () => {
      const { prisma } = makePrisma({ throwOn: 'update' });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.suspendUser(USER_ID, null);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBeInstanceOf(UnknownFailure);
    });

    it('fails the whole suspension when the audit row cannot be written', async () => {
      // The transaction is the point. Writing the ban and then failing to log
      // it would fail in exactly the case the log exists for, leaving a
      // suspended account with no record of who suspended it.
      const { prisma } = makePrisma({ throwOn: 'log' });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.suspendUser(USER_ID, 'spam', 'admin-9');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBeInstanceOf(UnknownFailure);
    });
  });

  describe('unsuspendUser', () => {
    it('clears suspendedAt and suspensionReason', async () => {
      const { prisma, updateManyAndReturn } = makePrisma();
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.unsuspendUser(USER_ID);

      expect(result).toEqual({ ok: true, value: undefined });
      expect(updateManyAndReturn).toHaveBeenCalledWith({
        where: { id: USER_ID, deletedAt: null },
        data: { suspendedAt: null, suspensionReason: null },
        select: { email: true },
      });
    });

    it('leaves the ban on the record after it is lifted', async () => {
      // `suspensionReason` is wiped by the update above, so without its own
      // event the act of lifting a ban erased every trace it had happened.
      const { prisma, createEvent } = makePrisma();
      const repo = new PrismaAuthRepository(prisma);

      await repo.unsuspendUser(USER_ID, 'admin-9');

      expect(createEvent).toHaveBeenCalledWith({
        data: expect.objectContaining({
          event: 'UNSUSPENDED',
          userId: USER_ID,
          actorId: 'admin-9',
        }),
      });
    });

    it('does not carry a reason, which belongs to the ban and not to lifting it', async () => {
      const { prisma, createEvent } = makePrisma();
      const repo = new PrismaAuthRepository(prisma);

      await repo.unsuspendUser(USER_ID, 'admin-9');

      const written = createEvent.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(written.data).not.toHaveProperty('reason');
    });

    it('returns NotFoundFailure when the account is already deleted or does not exist', async () => {
      const { prisma } = makePrisma({ updatedRows: [] });
      const repo = new PrismaAuthRepository(prisma);

      const result = await repo.unsuspendUser(USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBeInstanceOf(NotFoundFailure);
    });
  });
});
