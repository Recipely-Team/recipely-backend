import type { PrismaClient } from '@prisma/client';
import { FocalPoint } from '@domain/recipes/photos/focal-point';
import { PrismaPhotoFocusRepository } from '@infrastructure/repositories/recipes/prisma-photo-focus-repository';

function setup(covers: Array<{ id: string; image: string }>, media: Array<{ id: string; recipeId: string; url: string }>) {
  const recipeFindMany = jest.fn().mockResolvedValue(covers);
  const mediaFindMany = jest.fn().mockResolvedValue(media);
  const recipeUpdateMany = jest.fn().mockReturnValue('recipe-op');
  const mediaUpdateMany = jest.fn().mockReturnValue('media-op');
  const transaction = jest.fn().mockResolvedValue([]);
  const prisma = {
    recipe: { findMany: recipeFindMany, updateMany: recipeUpdateMany },
    recipeMedia: { findMany: mediaFindMany, updateMany: mediaUpdateMany },
    $transaction: transaction,
  } as unknown as PrismaClient;
  return { repo: new PrismaPhotoFocusRepository(prisma), recipeFindMany, mediaFindMany, recipeUpdateMany, mediaUpdateMany, transaction };
}

describe('PrismaPhotoFocusRepository.listPending', () => {
  it('picks live covers with no focus below the attempt cap, newest first', async () => {
    const s = setup([], []);
    await s.repo.listPending(5, 3);
    expect(s.recipeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, image: { not: '' }, imageFocusX: null, imageFocusAttempts: { lt: 3 } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    );
    expect(s.mediaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'image', focusX: null, focusAttempts: { lt: 3 }, recipe: { deletedAt: null } },
      }),
    );
  });

  it('fills the batch with gallery photos after covers, dropping a photo that is its recipe cover', async () => {
    const s = setup(
      [{ id: 'r1', image: 'https://x/a.jpg' }],
      [
        { id: 'm1', recipeId: 'r1', url: 'https://x/a.jpg' },
        { id: 'm2', recipeId: 'r1', url: 'https://x/b.jpg' },
        { id: 'm3', recipeId: 'r2', url: 'https://x/c.jpg' },
      ],
    );
    const r = await s.repo.listPending(2, 3);
    expect(r.ok && r.value).toEqual([
      { recipeId: 'r1', mediaId: null, url: 'https://x/a.jpg' },
      { recipeId: 'r1', mediaId: 'm2', url: 'https://x/b.jpg' },
    ]);
  });

  it('does not query gallery photos when covers already fill the batch', async () => {
    const s = setup([{ id: 'r1', image: 'a' }, { id: 'r2', image: 'b' }], []);
    const r = await s.repo.listPending(2, 3);
    expect(r.ok && r.value.length).toBe(2);
    expect(s.mediaFindMany).not.toHaveBeenCalled();
  });
});

describe('PrismaPhotoFocusRepository writes', () => {
  const target = { recipeId: 'r1', mediaId: null, url: 'https://x/a.jpg' };

  it('saves the point on every row of the recipe still showing that URL', async () => {
    const s = setup([], []);
    const p = FocalPoint.create(0.2, 0.8);
    if (!p.ok) throw new Error('fixture');
    await s.repo.saveFocus(target, p.value);
    expect(s.recipeUpdateMany).toHaveBeenCalledWith({
      where: { id: 'r1', image: 'https://x/a.jpg' },
      data: { imageFocusX: 0.2, imageFocusY: 0.8 },
    });
    expect(s.mediaUpdateMany).toHaveBeenCalledWith({
      where: { recipeId: 'r1', url: 'https://x/a.jpg' },
      data: { focusX: 0.2, focusY: 0.8 },
    });
  });

  it('records a failure as one more attempt and writes no focus', async () => {
    const s = setup([], []);
    await s.repo.recordFailure(target);
    expect(s.recipeUpdateMany).toHaveBeenCalledWith({
      where: { id: 'r1', image: 'https://x/a.jpg' },
      data: { imageFocusAttempts: { increment: 1 } },
    });
    expect(s.mediaUpdateMany).toHaveBeenCalledWith({
      where: { recipeId: 'r1', url: 'https://x/a.jpg' },
      data: { focusAttempts: { increment: 1 } },
    });
  });
});
