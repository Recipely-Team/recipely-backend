import type { PrismaClient } from '@prisma/client';
import { buildDashboardHandler } from '@infrastructure/admin/dashboard-handler';

// All ten counts must run inside a single prisma.$transaction — one
// round-trip — so this test intercepts $transaction directly rather than
// mocking each model's `count` separately, and asserts on the number of
// operations batched together.

function makePrisma(counts: number[]): { prisma: PrismaClient; transaction: jest.Mock } {
  const transaction = jest.fn().mockResolvedValue(counts);
  const prisma = {
    $transaction: transaction,
    user: { count: jest.fn() },
    recipe: { count: jest.fn() },
    comment: { count: jest.fn() },
    device: { count: jest.fn() },
    importJob: { count: jest.fn() },
  } as unknown as PrismaClient;
  return { prisma, transaction };
}

describe('buildDashboardHandler', () => {
  it('batches all counts into a single $transaction call', async () => {
    const { prisma, transaction } = makePrisma([10, 2, 50, 5, 100, 3, 7, 1, 4, 1]);
    const handler = buildDashboardHandler(prisma);

    await handler(undefined, undefined, undefined as never);

    expect(transaction).toHaveBeenCalledTimes(1);
    const ops = transaction.mock.calls[0][0] as unknown[];
    expect(ops).toHaveLength(10);
  });

  it('maps the transaction results to the documented shape', async () => {
    const { prisma } = makePrisma([10, 2, 50, 5, 100, 3, 7, 1, 4, 1]);
    const handler = buildDashboardHandler(prisma);

    const data = await handler(undefined, undefined, undefined as never);

    expect(data).toEqual({
      users: { total: 10, newLast7Days: 2 },
      recipes: { total: 50, pendingModeration: 5 },
      comments: { total: 100, pendingModeration: 3 },
      devices: { total: 7 },
      imports: { active: 1, last7Days: { done: 4, failed: 1 } },
    });
  });

  it('scopes the pending counts to live rows, not soft-deleted ones', async () => {
    const { prisma } = makePrisma(new Array(10).fill(0));
    const handler = buildDashboardHandler(prisma);

    await handler(undefined, undefined, undefined as never);

    // deletedAt is part of the filter on purpose: a soft-deleted pending row
    // is work no admin can action, and for comments it can never be cleared.
    expect(prisma.recipe.count).toHaveBeenCalledWith({
      where: { deletedAt: null, moderationStatus: 'pending' },
    });
    expect(prisma.comment.count).toHaveBeenCalledWith({
      where: { deletedAt: null, moderationStatus: 'pending' },
    });
  });

  it('scopes the active-import count to queued/running statuses', async () => {
    const { prisma } = makePrisma(new Array(10).fill(0));
    const handler = buildDashboardHandler(prisma);

    await handler(undefined, undefined, undefined as never);

    expect(prisma.importJob.count).toHaveBeenCalledWith({ where: { status: { in: ['queued', 'running'] } } });
  });
});
