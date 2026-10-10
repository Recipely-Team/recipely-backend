import type { PrismaClient } from '@prisma/client';
import { PrismaMealPlanRepository } from '@infrastructure/repositories/meal-plan/prisma-meal-plan-repository';
import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';

// The two shapes a refactor could quietly break: the readability filter that
// keeps a hidden recipe out of the plan, and the conditional write that makes
// "eaten" link only once.

const USER = 'u1';

function prismaWith(rows: unknown[] = []) {
  const mealPlanEntry = {
    findMany: jest.fn().mockResolvedValue(rows),
    findFirst: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  return { prisma: { mealPlanEntry } as unknown as PrismaClient, mealPlanEntry };
}

const week = () => {
  const range = MealPlanRange.create('2026-10-12', '2026-10-18');
  if (!range.ok) throw new Error('fixture');
  return range.value;
};

const READABLE = { deletedAt: null, OR: [{ isPublished: true }, { ownerId: USER }] };

describe('PrismaMealPlanRepository', () => {
  it('reads only rows whose recipe the user can read, in date, meal, position order', async () => {
    const { prisma, mealPlanEntry } = prismaWith();
    const result = await new PrismaMealPlanRepository(prisma).listRange(USER, week());
    expect(result.ok).toBe(true);
    const query = mealPlanEntry.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      userId: USER,
      date: { gte: new Date('2026-10-12T00:00:00.000Z'), lte: new Date('2026-10-18T00:00:00.000Z') },
      recipe: READABLE,
    });
    expect(query.orderBy.slice(0, 3)).toEqual([{ date: 'asc' }, { meal: 'asc' }, { position: 'asc' }]);
  });

  it('answers a row whose recipe is hidden as the plan entry not found', async () => {
    const { prisma, mealPlanEntry } = prismaWith();
    const found = await new PrismaMealPlanRepository(prisma).find('e1', USER);
    expect(mealPlanEntry.findFirst.mock.calls[0][0].where).toEqual({ id: 'e1', userId: USER, recipe: READABLE });
    expect(!found.ok && found.failure.messageKey).toBe('errors.not_found.meal_plan_entry');
  });

  it('links a diary entry only onto an uneaten row of the owner', async () => {
    const { prisma, mealPlanEntry } = prismaWith();
    const linked = await new PrismaMealPlanRepository(prisma).linkEaten('e1', USER, 'f1');
    expect(mealPlanEntry.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', userId: USER, foodLogEntryId: null }, data: { foodLogEntryId: 'f1' } });
    expect(linked.ok && linked.value).toBe(false);
  });
});
