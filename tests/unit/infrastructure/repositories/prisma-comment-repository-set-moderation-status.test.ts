import type { PrismaClient } from '@prisma/client';
import { PrismaCommentRepository } from '@infrastructure/repositories/comments/prisma-comment-repository';

// setModerationStatus reads the comment's current status first because
// Recipe.commentCount only counts approved comments — the increment/decrement
// direction depends on the transition, not just the destination status. These
// tests assert (1) the right transition adjusts commentCount in the right
// direction inside a single $transaction, and (2) a same-bucket transition
// (e.g. pending -> rejected) never touches commentCount at all.

const COMMENT_ID = 'comment-1';
const RECIPE_ID = 'recipe-1';
const AUTHOR_ID = 'author-1';

function makePrisma(options: {
  existing?: { moderationStatus: string; recipeId: string; authorId: string } | null;
  update?: jest.Mock;
  transaction?: jest.Mock;
}): { prisma: PrismaClient; update: jest.Mock; transaction: jest.Mock } {
  const findFirst = jest.fn().mockResolvedValue(
    options.existing !== undefined
      ? options.existing
      : { moderationStatus: 'approved', recipeId: RECIPE_ID, authorId: AUTHOR_ID },
  );
  const update = options.update ?? jest.fn().mockResolvedValue({});
  const recipeUpdate = jest.fn().mockResolvedValue({});
  const transaction = options.transaction ?? jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));

  const prisma = {
    comment: { findFirst, update },
    recipe: { update: recipeUpdate },
    $transaction: transaction,
  } as unknown as PrismaClient;

  return { prisma, update, transaction };
}

describe('PrismaCommentRepository.setModerationStatus — not found', () => {
  it('returns NotFoundFailure when the comment does not exist or is soft-deleted', async () => {
    const { prisma } = makePrisma({ existing: null });
    const repo = new PrismaCommentRepository(prisma);

    const result = await repo.setModerationStatus(COMMENT_ID, 'approved');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('PrismaCommentRepository.setModerationStatus — pending -> approved', () => {
  it('increments Recipe.commentCount inside a transaction', async () => {
    const { prisma, transaction } = makePrisma({
      existing: { moderationStatus: 'pending', recipeId: RECIPE_ID, authorId: AUTHOR_ID },
    });
    const repo = new PrismaCommentRepository(prisma);

    const result = await repo.setModerationStatus(COMMENT_ID, 'approved');

    expect(result.ok).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: RECIPE_ID },
      data: { commentCount: { increment: 1 } },
    });
  });
});

describe('PrismaCommentRepository.setModerationStatus — approved -> rejected', () => {
  it('decrements Recipe.commentCount inside a transaction', async () => {
    const { prisma, transaction } = makePrisma({
      existing: { moderationStatus: 'approved', recipeId: RECIPE_ID, authorId: AUTHOR_ID },
    });
    const repo = new PrismaCommentRepository(prisma);

    const result = await repo.setModerationStatus(COMMENT_ID, 'rejected');

    expect(result.ok).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: RECIPE_ID },
      data: { commentCount: { decrement: 1 } },
    });
  });
});

describe('PrismaCommentRepository.setModerationStatus — pending -> rejected', () => {
  it('never touches Recipe.commentCount because neither side of the transition is approved', async () => {
    const { prisma, transaction, update } = makePrisma({
      existing: { moderationStatus: 'pending', recipeId: RECIPE_ID, authorId: AUTHOR_ID },
    });
    const repo = new PrismaCommentRepository(prisma);

    const result = await repo.setModerationStatus(COMMENT_ID, 'rejected');

    expect(result.ok).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: COMMENT_ID }, data: { moderationStatus: 'rejected' } });
    expect(prisma.recipe.update).not.toHaveBeenCalled();
  });
});

describe('PrismaCommentRepository.setModerationStatus — resolved value', () => {
  it('returns the comment authorId and recipeId for the caller to notify', async () => {
    const { prisma } = makePrisma({
      existing: { moderationStatus: 'approved', recipeId: RECIPE_ID, authorId: AUTHOR_ID },
    });
    const repo = new PrismaCommentRepository(prisma);

    const result = await repo.setModerationStatus(COMMENT_ID, 'approved');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ authorId: AUTHOR_ID, recipeId: RECIPE_ID });
  });
});
