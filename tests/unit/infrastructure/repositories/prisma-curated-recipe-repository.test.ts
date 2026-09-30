import type { PrismaClient } from '@prisma/client';
import { Recipe } from '@domain/recipes/recipe';
import { ImageCredit } from '@domain/recipes/curated/image-credit';
import { curatedRecipeProps } from '@application/recipes/curated/curated-recipe-props';
import { PrismaCuratedRecipeRepository } from '@infrastructure/repositories/recipes/prisma-curated-recipe-repository';
import { loadCuratedFixture } from '../../application/recipes/curated/curated-fixtures';

const soup = loadCuratedFixture('mercimek-corbasi');
const credit = ImageCredit.create(soup.image.credit);
if (!credit.ok) throw new Error('fixture credit invalid');
const created = Recipe.create(curatedRecipeProps(soup, {
  id: 'recipe-1', ownerId: 'official-1', image: 'https://api.example.com/uploads/a.jpg', imageCredit: credit.value, now: new Date(),
}));
if (!created.ok) throw new Error('fixture recipe invalid');
const recipe = created.value;

const makePrisma = (row: Record<string, unknown> | null = { image: 'https://api.example.com/uploads/a.jpg' }) => {
  const update = jest.fn().mockResolvedValue({});
  const create = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(row);
  const findFirst = jest.fn().mockResolvedValue(row);
  return { prisma: { recipe: { update, create, findUnique, findFirst } } as unknown as PrismaClient, update, create, findFirst };
};

/**
 * A re-import once wrote isPublished=true / moderationStatus=approved on every
 * replace, re-publishing a recipe a moderator had taken down. Visibility is
 * create's alone.
 */
describe('PrismaCuratedRecipeRepository — visibility', () => {
  it('replace never writes isPublished or moderationStatus', async () => {
    const { prisma, update } = makePrisma();

    await new PrismaCuratedRecipeRepository(prisma).replace(recipe, 'hash');

    const data = update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(data).not.toHaveProperty('isPublished');
    expect(data).not.toHaveProperty('moderationStatus');
    expect(data).toMatchObject({ imageSourceHash: 'hash', origin: 'CURATED' });
  });

  it('create is the one place that sets them', async () => {
    const { prisma, create } = makePrisma();

    await new PrismaCuratedRecipeRepository(prisma).create(recipe, 'hash');

    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({ isPublished: true, moderationStatus: 'approved', slug: 'mercimek-corbasi' });
  });

  it('keeps the photo focus when the cover is unchanged, and resets it when it changes', async () => {
    const same = makePrisma();
    await new PrismaCuratedRecipeRepository(same.prisma).replace(recipe, 'hash');
    expect(same.update.mock.calls[0]?.[0]?.data).not.toHaveProperty('imageFocusX');

    const moved = makePrisma({ image: 'https://api.example.com/uploads/old.jpg' });
    await new PrismaCuratedRecipeRepository(moved.prisma).replace(recipe, 'hash');
    expect(moved.update.mock.calls[0]?.[0]?.data).toMatchObject({ imageFocusX: null, imageFocusY: null, imageFocusAttempts: 0 });
  });

  it('reads an unknown stored moderation status as pending, so the import leaves the row alone', async () => {
    const { prisma } = makePrisma({ id: 'r', deletedAt: null, image: 'x', imageSourceHash: null, isPublished: true, moderationStatus: 'escalated' });

    const found = await new PrismaCuratedRecipeRepository(prisma).findBySlug('official-1', 'mercimek-corbasi');

    expect(found.ok && found.value?.moderationStatus).toBe('pending');
  });
});
