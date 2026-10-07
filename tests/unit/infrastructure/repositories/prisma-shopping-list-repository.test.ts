import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaShoppingListRepository } from '@infrastructure/repositories/shopping/prisma-shopping-list-repository';
import { ShoppingItem } from '@domain/shopping/shopping-item';

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
  return { prisma, findMany, transaction, update: (prisma as unknown as { shoppingListItem: { update: jest.Mock } }).shoppingListItem.update };
}

const LATER = new Date('2026-10-07T10:05:00Z');
const merged = () => {
  const built = ShoppingItem.create({ ...ROW, quantity: 5, updatedAt: LATER });
  if (!built.ok) throw new Error('fixture');
  return built.value;
};

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

  // Device A ticks "Domates" while device B's batch merges into it: B must not untick it or undo a rename.
  it('writes a merge only as the new quantity, onto the unchecked version the batch read', async () => {
    const { prisma, update } = prismaWith();
    await new PrismaShoppingListRepository(prisma).saveBatch([{ item: merged(), seenUpdatedAt: NOW }], []);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'i1', userId: 'u1', checked: false, updatedAt: NOW },
      data: { quantity: 5, updatedAt: LATER },
    });
  });

  it('answers a conflict when the merged item changed after the read', async () => {
    const { prisma, transaction } = prismaWith();
    transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'x' }));
    const result = await new PrismaShoppingListRepository(prisma).saveBatch([{ item: merged(), seenUpdatedAt: NOW }], []);
    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.shopping_list_changed');
  });
});
