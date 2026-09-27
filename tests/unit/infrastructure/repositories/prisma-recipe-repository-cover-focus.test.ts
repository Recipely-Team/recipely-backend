import type { PrismaClient } from '@prisma/client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';

/**
 * A cover's focal point describes ONE photo. When the cover changes, the old
 * point would crop the new photo around wherever the old dish happened to be,
 * so the reset must run — and must run BEFORE the new URL is written, since it
 * is conditional on the cover being different.
 */
describe('PrismaRecipeRepository.writeCover — cover focus', () => {
  it('forgets the focus and its failed attempts when the cover becomes a different photo', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { recipe: { updateMany }, recipeMedia: { deleteMany: jest.fn() } };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaClient;

    const r = await new PrismaRecipeRepository(prisma).writeCover('r1', { image: 'https://x/new.jpg', dropMediaIds: [] });

    expect(r.ok).toBe(true);
    expect(updateMany.mock.calls[0]).toEqual([
      {
        where: { id: 'r1', NOT: { image: 'https://x/new.jpg' } },
        data: { imageFocusX: null, imageFocusY: null, imageFocusAttempts: 0 },
      },
    ]);
    expect(updateMany.mock.calls[1]?.[0]).toMatchObject({ data: { image: 'https://x/new.jpg' } });
  });
});
