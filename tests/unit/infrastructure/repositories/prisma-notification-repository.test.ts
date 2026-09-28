import type { PrismaClient } from '@prisma/client';
import { PrismaNotificationRepository } from '@infrastructure/repositories/notifications/prisma-notification-repository';
import { UnknownFailure } from '@core/failure';

// Notifications are soft-deleted so a comment delete can be undone/audited
// without losing the notification row outright. Every read path must
// therefore filter deletedAt: null, and softDeleteByCommentId is the only
// write path that sets it.

const COMMENT_ID = 'comment-uuid';
const RECIPIENT_ID = 'recipient-uuid';
const NOTIFICATION_ID = 'notification-uuid';

type Mocks = {
  updateMany: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  transaction: jest.Mock;
};

function makePrisma(overrides: Partial<Mocks> = {}): { prisma: PrismaClient; mocks: Mocks } {
  const mocks: Mocks = {
    updateMany: overrides.updateMany ?? jest.fn().mockResolvedValue({ count: 0 }),
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
    count: overrides.count ?? jest.fn().mockResolvedValue(0),
    transaction: overrides.transaction ?? jest.fn(),
  };

  mocks.transaction.mockImplementation(
    (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
  );

  const prisma = {
    notification: {
      updateMany: mocks.updateMany,
      findMany: mocks.findMany,
      count: mocks.count,
    },
    $transaction: mocks.transaction,
  } as unknown as PrismaClient;

  return { prisma, mocks };
}

describe('PrismaNotificationRepository.softDeleteByCommentId', () => {
  it('soft-deletes only live notifications for the comment by stamping deletedAt', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaNotificationRepository(prisma);

    const result = await repo.softDeleteByCommentId(COMMENT_ID);

    expect(result.ok).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { commentId: COMMENT_ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('maps an unexpected error to UnknownFailure without throwing', async () => {
    const { prisma } = makePrisma({ updateMany: jest.fn().mockRejectedValue(new Error('connection reset')) });
    const repo = new PrismaNotificationRepository(prisma);

    const result = await repo.softDeleteByCommentId(COMMENT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnknownFailure);
    }
  });
});

describe('PrismaNotificationRepository — reads exclude soft-deleted rows', () => {
  it('listForUser filters on deletedAt: null', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaNotificationRepository(prisma);

    await repo.listForUser(RECIPIENT_ID, 20, 0);

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientId: RECIPIENT_ID, deletedAt: null } }),
    );
    expect(mocks.count).toHaveBeenCalledWith({ where: { recipientId: RECIPIENT_ID, deletedAt: null } });
  });

  it('countUnread filters on deletedAt: null', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaNotificationRepository(prisma);

    await repo.countUnread(RECIPIENT_ID);

    expect(mocks.count).toHaveBeenCalledWith({
      where: { recipientId: RECIPIENT_ID, read: false, deletedAt: null },
    });
  });

  it('exists filters on deletedAt: null', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaNotificationRepository(prisma);

    await repo.exists({ recipientId: RECIPIENT_ID, type: 'comment', commentId: COMMENT_ID });

    expect(mocks.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it('markRead filters on deletedAt: null', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaNotificationRepository(prisma);

    await repo.markRead(NOTIFICATION_ID, RECIPIENT_ID);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: NOTIFICATION_ID, recipientId: RECIPIENT_ID, deletedAt: null },
      data: { read: true },
    });
  });

  it('markAllRead filters on deletedAt: null', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaNotificationRepository(prisma);

    await repo.markAllRead(RECIPIENT_ID);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { recipientId: RECIPIENT_ID, read: false, deletedAt: null },
      data: { read: true },
    });
  });
});

describe('PrismaNotificationRepository — import provenance', () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: NOTIFICATION_ID,
    type: 'import_done',
    senderId: null,
    recipeId: null,
    commentId: null,
    draftId: 'draft-1',
    message: 'Menemen',
    read: false,
    createdAt: new Date('2026-09-28T00:00:00Z'),
    sender: null,
    recipe: null,
    comment: null,
    sourcePlatform: null,
    sourceHandle: null,
    ...overrides,
  });

  it('exposes the platform and account on the listed item', async () => {
    const { prisma } = makePrisma({
      findMany: jest.fn().mockResolvedValue([row({ sourcePlatform: 'TIKTOK', sourceHandle: 'chef.ayse' })]),
      count: jest.fn().mockResolvedValue(1),
    });
    const result = await new PrismaNotificationRepository(prisma).listForUser(RECIPIENT_ID, 20, 0);

    expect(result.ok && result.value.items[0]).toEqual(
      expect.objectContaining({ sourcePlatform: 'TIKTOK', sourceHandle: 'chef.ayse' }),
    );
  });

  it('lists a row written before the columns existed with null provenance', async () => {
    const { prisma } = makePrisma({ findMany: jest.fn().mockResolvedValue([row({})]), count: jest.fn().mockResolvedValue(1) });
    const result = await new PrismaNotificationRepository(prisma).listForUser(RECIPIENT_ID, 20, 0);

    expect(result.ok && result.value.items[0]).toEqual(expect.objectContaining({ sourcePlatform: null, sourceHandle: null }));
  });

  it('writes the platform and account on create', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { notification: { create } } as unknown as PrismaClient;

    await new PrismaNotificationRepository(prisma).create({
      recipientId: RECIPIENT_ID,
      type: 'import_done',
      sourcePlatform: 'YOUTUBE',
      sourceHandle: 'chefchannel',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourcePlatform: 'YOUTUBE', sourceHandle: 'chefchannel' }),
    });
  });
});
