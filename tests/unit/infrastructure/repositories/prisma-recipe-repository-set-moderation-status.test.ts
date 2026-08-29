import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';

// A single PK-indexed update — no read-then-write, unlike the comment
// counterpart, because a Recipe's own isPublished/moderationStatus columns
// carry no denormalized counter on another table.

const RECIPE_ID = 'recipe-1';
const OWNER_ID = 'owner-1';

function makePrisma(updateManyAndReturn: jest.Mock): PrismaClient {
  return { recipe: { updateManyAndReturn } } as unknown as PrismaClient;
}

describe('PrismaRecipeRepository.setModerationStatus — approve', () => {
  it('sets moderationStatus and isPublished together and returns the ownerId', async () => {
    const update = jest.fn().mockResolvedValue([{ ownerId: OWNER_ID }]);
    const repo = new PrismaRecipeRepository(makePrisma(update));

    const result = await repo.setModerationStatus(RECIPE_ID, 'approved', true);

    expect(update).toHaveBeenCalledWith({
      where: { id: RECIPE_ID, deletedAt: null },
      data: { moderationStatus: 'approved', isPublished: true },
      select: { ownerId: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ ownerId: OWNER_ID });
  });
});

describe('PrismaRecipeRepository.setModerationStatus — reject', () => {
  it('unpublishes the recipe alongside the rejected status', async () => {
    const update = jest.fn().mockResolvedValue([{ ownerId: OWNER_ID }]);
    const repo = new PrismaRecipeRepository(makePrisma(update));

    await repo.setModerationStatus(RECIPE_ID, 'rejected', false);

    expect(update).toHaveBeenCalledWith({
      where: { id: RECIPE_ID, deletedAt: null },
      data: { moderationStatus: 'rejected', isPublished: false },
      select: { ownerId: true },
    });
  });
});

describe('PrismaRecipeRepository.setModerationStatus — not found', () => {
  it('returns NotFoundFailure when Prisma reports P2025', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: '6.0.0',
    });
    const update = jest.fn().mockRejectedValue(error);
    const repo = new PrismaRecipeRepository(makePrisma(update));

    const result = await repo.setModerationStatus(RECIPE_ID, 'approved', true);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('PrismaRecipeRepository.setModerationStatus — soft-deleted', () => {
  // An owner can delete their own still-pending recipe. Moderating that row
  // would set isPublished on something no listing can ever return.
  it('returns NotFoundFailure and publishes nothing when the row is soft-deleted', async () => {
    const update = jest.fn().mockResolvedValue([]);
    const repo = new PrismaRecipeRepository(makePrisma(update));

    const result = await repo.setModerationStatus(RECIPE_ID, 'approved', true);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: RECIPE_ID, deletedAt: null } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});
