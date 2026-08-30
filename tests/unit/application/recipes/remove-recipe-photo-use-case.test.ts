import { RemoveRecipePhotoUseCase } from '@application/recipes/use-cases/remove-recipe-photo-use-case';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';

const OWNER = 'owner-1';

const repo = (ownerId: string, removed: { recipeId?: string; mediaId?: string }): IRecipeRepository =>
  ({
    getById: async () => ({ ok: true, value: { recipe: { ownerId } } }),
    removeMedia: async (recipeId: string, mediaId: string) => {
      removed.recipeId = recipeId;
      removed.mediaId = mediaId;
      return { ok: true, value: undefined };
    },
  }) as unknown as IRecipeRepository;

describe('removing a photo from a published recipe', () => {
  it('lets the owner take their own photo down', async () => {
    const removed: { recipeId?: string; mediaId?: string } = {};

    const result = await new RemoveRecipePhotoUseCase(repo(OWNER, removed)).execute({
      recipeId: 'recipe-1',
      mediaId: 'media-1',
      requesterId: OWNER,
    });

    expect(result.ok).toBe(true);
    // Both ids reach the repository: the media id alone would let the owner of
    // one recipe delete a row out of another's gallery by guessing it.
    expect(removed).toEqual({ recipeId: 'recipe-1', mediaId: 'media-1' });
  });

  it('refuses anyone who does not own the recipe', async () => {
    const removed: { recipeId?: string; mediaId?: string } = {};

    const result = await new RemoveRecipePhotoUseCase(repo('someone-else', removed)).execute({
      recipeId: 'recipe-1',
      mediaId: 'media-1',
      requesterId: OWNER,
    });

    expect(result.ok).toBe(false);
    expect(removed).toEqual({});
  });
});
