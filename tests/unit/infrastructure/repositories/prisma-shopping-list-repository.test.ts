import type { PrismaClient } from '@prisma/client';
import { PrismaShoppingListRepository } from '@infrastructure/repositories/shopping/prisma-shopping-list-repository';

// The list query and the batch write are the two shapes a refactor could
// quietly break: the order the app shows (unchecked first) and the single
// transaction a batch is written in.

const NOW = new Date('2026-10-07T10:00:00Z');
const ROW = {
  id: 'i1', userId: 'u1', label: 'Domates', quantity: 2, unit: 'adet', recipeId: null, recipeName: null,
  checked: false, position: 0, createdAt: NOW, updatedAt: NOW,
};

function prismaWith() {
  const findMany = jest.fn().mockReturnValue([ROW]);
  const count = jest.fn().mockReturnValue(41);
  const transaction = jest.fn(async (ops: unknown[]) => Promise.all(ops));
  const prisma = {
    $transaction: transaction,
    shoppingListItem: { findMany, count, update: jest.fn().mockReturnValue('u'), createMany: jest.fn().mockReturnValue('c') },
  } as unknown as PrismaClient;
  return { prisma, findMany, transaction };
}

describe('PrismaShoppingListRepository', () => {
  it('pages unchecked lines before checked ones, by position, in one round-trip', async () => {
    const { prisma, findMany, transaction } = prismaWith();
    const result = await new PrismaShoppingListRepository(prisma).list('u1', 3, 20);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: [{ checked: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      skip: 40,
      take: 20,
    });
    expect(result.ok && [result.value.total, result.value.page, result.value.items[0]?.label]).toEqual([41, 3, 'Domates']);
  });

  it('reports a corrupt row as a failure instead of throwing', async () => {
    const { prisma, findMany } = prismaWith();
    findMany.mockReturnValue([{ ...ROW, label: '' }]);
    const result = await new PrismaShoppingListRepository(prisma).list('u1', 1, 20);
    expect(!result.ok && result.failure.code).toBe('unknown');
  });
});
