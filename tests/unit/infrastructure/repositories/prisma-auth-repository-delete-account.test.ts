import type { PrismaClient } from '@prisma/client';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { DeletedAccount } from '@domain/auth/deleted-account';
import { emailFingerprint } from '@infrastructure/security/email-fingerprint';
import { NotFoundFailure, UnknownFailure } from '@core/failure';

// deleteAccount tombstones the account instead of dropping the row. What these
// tests lock down is everything a partial implementation would silently skip:
// the PII scrub (which is also what frees the address for a fresh signup), the
// content soft-delete, the purge of anything that would keep a session alive or
// keep counting a deleted user, and the audit row — all inside ONE transaction,
// so a deletion that cannot be logged never commits.

const USER_ID = 'user-1';
const EMAIL = 'Chef@Example.com';

type TxMocks = {
  userFindFirst: jest.Mock;
  userUpdate: jest.Mock;
  recipeUpdateMany: jest.Mock;
  recipeUpdate: jest.Mock;
  commentGroupBy: jest.Mock;
  commentUpdateMany: jest.Mock;
  logCreate: jest.Mock;
  deletes: Record<string, jest.Mock>;
  notificationUpdateMany: jest.Mock;
  feedbackUpdateMany: jest.Mock;
};

function makeTx(overrides: Partial<{ user: unknown; comments: unknown[] }> = {}): { prisma: PrismaClient; mocks: TxMocks } {
  const deletes: Record<string, jest.Mock> = {
    fcmToken: jest.fn().mockResolvedValue({ count: 1 }),
    device: jest.fn().mockResolvedValue({ count: 0 }),
    passwordResetToken: jest.fn().mockResolvedValue({ count: 0 }),
    favorite: jest.fn().mockResolvedValue({ count: 2 }),
    recipeLike: jest.fn().mockResolvedValue({ count: 3 }),
    commentLike: jest.fn().mockResolvedValue({ count: 0 }),
    userFollow: jest.fn().mockResolvedValue({ count: 4 }),
    notification: jest.fn().mockResolvedValue({ count: 5 }),
    creatorTag: jest.fn().mockResolvedValue({ count: 2 }),
    shoppingListItem: jest.fn().mockResolvedValue({ count: 7 }),
    mealParseUsage: jest.fn().mockResolvedValue({ count: 1 }),
  };

  const mocks: TxMocks = {
    userFindFirst: jest.fn().mockResolvedValue(
      'user' in overrides ? overrides.user : { id: USER_ID, email: EMAIL },
    ),
    userUpdate: jest.fn().mockResolvedValue({ id: USER_ID }),
    recipeUpdateMany: jest.fn().mockResolvedValue({ count: 2 }),
    recipeUpdate: jest.fn().mockResolvedValue({ id: 'recipe-1' }),
    commentGroupBy: jest.fn().mockResolvedValue(overrides.comments ?? []),
    commentUpdateMany: jest.fn().mockResolvedValue({ count: 0 }),
    logCreate: jest.fn().mockResolvedValue({ id: 'log-1' }),
    notificationUpdateMany: jest.fn().mockResolvedValue({ count: 0 }),
    feedbackUpdateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deletes,
  };

  const tx = {
    user: { findFirst: mocks.userFindFirst, update: mocks.userUpdate },
    recipe: { updateMany: mocks.recipeUpdateMany, update: mocks.recipeUpdate },
    comment: { groupBy: mocks.commentGroupBy, updateMany: mocks.commentUpdateMany },
    fcmToken: { deleteMany: deletes.fcmToken },
    device: { deleteMany: deletes.device },
    passwordResetToken: { deleteMany: deletes.passwordResetToken },
    favorite: { deleteMany: deletes.favorite },
    recipeLike: { deleteMany: deletes.recipeLike },
    commentLike: { deleteMany: deletes.commentLike },
    userFollow: { deleteMany: deletes.userFollow },
    notification: { deleteMany: deletes.notification, updateMany: mocks.notificationUpdateMany },
    feedback: { updateMany: mocks.feedbackUpdateMany },
    creatorTag: { deleteMany: deletes.creatorTag },
    shoppingListItem: { deleteMany: deletes.shoppingListItem },
    mealParseUsage: { deleteMany: deletes.mealParseUsage },
    accountEventLog: { create: mocks.logCreate },
  };

  const prisma = {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaClient;

  return { prisma, mocks };
}

describe('PrismaAuthRepository.deleteAccount', () => {
  it('tombstones the user: stamps deletedAt and scrubs every PII field', async () => {
    const { prisma, mocks } = makeTx();
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.deleteAccount(USER_ID);

    expect(result.ok).toBe(true);
    const data = mocks.userUpdate.mock.calls[0]?.[0]?.data;
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.email).toBe(DeletedAccount.tombstoneEmail(USER_ID));
    expect(data.displayName).toBe(DeletedAccount.DISPLAY_NAME);
    expect(data.passwordHash).toBeNull();
    expect(data.bio).toBeNull();
    expect(data.photoUrl).toBeNull();
  });

  it('deletes every creator tag in the same transaction, freeing the handles', async () => {
    const { prisma, mocks } = makeTx();

    await new PrismaAuthRepository(prisma).deleteAccount(USER_ID);

    expect(mocks.deletes.creatorTag).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });

  it('releases the address so the same person can sign up again as a new account', async () => {
    const { prisma, mocks } = makeTx();
    const repo = new PrismaAuthRepository(prisma);

    await repo.deleteAccount(USER_ID);

    // The rewritten address is unique per user id and non-routable, so the real
    // one no longer collides with the unique index on users.email.
    const email = mocks.userUpdate.mock.calls[0]?.[0]?.data?.email as string;
    expect(email).not.toBe(EMAIL);
    expect(email).toContain(USER_ID);
    expect(email.endsWith(`@${DeletedAccount.EMAIL_DOMAIN}`)).toBe(true);
  });

  it('soft-deletes owned recipes rather than cascading them away', async () => {
    const { prisma, mocks } = makeTx();
    const repo = new PrismaAuthRepository(prisma);

    await repo.deleteAccount(USER_ID);

    expect(mocks.recipeUpdateMany).toHaveBeenCalledWith({
      where: { ownerId: USER_ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('soft-deletes comments and decrements each affected recipe comment count', async () => {
    const { prisma, mocks } = makeTx({
      comments: [
        { recipeId: 'recipe-1', _count: { _all: 2 } },
        { recipeId: 'recipe-2', _count: { _all: 1 } },
      ],
    });
    const repo = new PrismaAuthRepository(prisma);

    await repo.deleteAccount(USER_ID);

    expect(mocks.commentUpdateMany).toHaveBeenCalledWith({
      where: { authorId: USER_ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mocks.recipeUpdate).toHaveBeenCalledWith({
      where: { id: 'recipe-1' },
      data: { commentCount: { decrement: 2 } },
    });
    expect(mocks.recipeUpdate).toHaveBeenCalledWith({
      where: { id: 'recipe-2' },
      data: { commentCount: { decrement: 1 } },
    });
  });

  it('counts only APPROVED comments when decrementing — a pending comment was never counted', async () => {
    // The counter is incremented on approval only (PrismaCommentRepository.add), so
    // decrementing for a pending/rejected comment would push another user's recipe
    // below its true count — permanently, since nothing recomputes it.
    const { prisma, mocks } = makeTx({ comments: [{ recipeId: 'recipe-1', _count: { _all: 1 } }] });
    const repo = new PrismaAuthRepository(prisma);

    await repo.deleteAccount(USER_ID);

    expect(mocks.commentGroupBy).toHaveBeenCalledWith({
      by: ['recipeId'],
      where: { authorId: USER_ID, moderationStatus: 'approved', deletedAt: null },
      _count: { _all: true },
    });
    // Exactly one decrement — the approved one.
    expect(mocks.recipeUpdate).toHaveBeenCalledTimes(1);
  });

  it('still hides comments that were never counted (author with only pending comments)', async () => {
    // groupBy returns nothing (no approved comments), but the pending ones must
    // still disappear with the account.
    const { prisma, mocks } = makeTx({ comments: [] });
    const repo = new PrismaAuthRepository(prisma);

    await repo.deleteAccount(USER_ID);

    expect(mocks.commentUpdateMany).toHaveBeenCalledWith({
      where: { authorId: USER_ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mocks.recipeUpdate).not.toHaveBeenCalled();
  });

  it('scrubs the reply-to address on retained feedback — the one PII field outside users', async () => {
    const { prisma, mocks } = makeTx();
    const repo = new PrismaAuthRepository(prisma);

    await repo.deleteAccount(USER_ID);

    expect(mocks.feedbackUpdateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { contactEmail: null },
    });
  });

  it('purges sessions and relationship rows so nothing keeps counting the deleted account', async () => {
    const { prisma, mocks } = makeTx();
    const repo = new PrismaAuthRepository(prisma);

    await repo.deleteAccount(USER_ID);

    expect(mocks.deletes.fcmToken).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(mocks.deletes.device).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(mocks.deletes.passwordResetToken).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(mocks.deletes.favorite).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(mocks.deletes.recipeLike).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(mocks.deletes.commentLike).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(mocks.deletes.userFollow).toHaveBeenCalledWith({
      where: { OR: [{ followerId: USER_ID }, { followingId: USER_ID }] },
    });
    expect(mocks.deletes.notification).toHaveBeenCalledWith({ where: { recipientId: USER_ID } });
    expect(mocks.notificationUpdateMany).toHaveBeenCalledWith({
      where: { senderId: USER_ID },
      data: { senderId: null },
    });
  });

  // A shopping list outliving its account would keep a deleted person's private
  // notes in the database with nobody able to reach or remove them.
  it("hard-deletes the user's shopping list inside the deletion transaction", async () => {
    const { prisma, mocks } = makeTx();
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.deleteAccount(USER_ID);

    expect(result.ok).toBe(true);
    expect(mocks.deletes.shoppingListItem).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(mocks.deletes.mealParseUsage).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });

  it('writes a DELETED audit row fingerprinted by email, not by the address itself', async () => {
    const { prisma, mocks } = makeTx();
    const repo = new PrismaAuthRepository(prisma);

    await repo.deleteAccount(USER_ID);

    expect(mocks.logCreate).toHaveBeenCalledWith({
      data: { event: 'DELETED', userId: USER_ID, emailHash: emailFingerprint(EMAIL) },
    });
    // The log must not re-introduce the PII the tombstone just scrubbed.
    const logged = JSON.stringify(mocks.logCreate.mock.calls[0]?.[0]);
    expect(logged).not.toContain(EMAIL);
  });

  it('returns NotFoundFailure and writes nothing when the account is already deleted', async () => {
    const { prisma, mocks } = makeTx({ user: null });
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.deleteAccount(USER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(NotFoundFailure);
    }
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.logCreate).not.toHaveBeenCalled();
  });

  it('maps unexpected errors to UnknownFailure without throwing', async () => {
    const { prisma, mocks } = makeTx();
    mocks.userFindFirst.mockRejectedValue(new Error('connection reset'));
    const repo = new PrismaAuthRepository(prisma);

    const result = await repo.deleteAccount(USER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnknownFailure);
    }
  });
});
