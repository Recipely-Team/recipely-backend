import { RemoveRecipePhotoUseCase } from '@application/recipes/photos/remove-recipe-photo-use-case';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { CoverChange } from '@domain/recipes/editing/cover-change';
import { recipe, recipeProps } from '../../fixtures/recipe-fixture';

const OWNER = 'owner-1';
const GALLERY = [
  { id: 'media-1', type: 'image' as const, url: 'https://x/1.jpg', position: 0 },
  { id: 'media-2', type: 'image' as const, url: 'https://x/2.jpg', position: 1 },
];

const repo = (
  ownerId: string,
  written: { recipeId?: string; change?: CoverChange },
  image = 'https://x/cover.jpg',
): RecipeRepositoryInterface =>
  ({
    getById: async () => ({ ok: true, value: { recipe: recipe(recipeProps({ ownerId, image, media: GALLERY })) } }),
    writeCover: async (recipeId: string, change: CoverChange) => {
      written.recipeId = recipeId;
      written.change = change;
      return { ok: true, value: undefined };
    },
  }) as unknown as RecipeRepositoryInterface;

describe('removing a photo from a recipe', () => {
  it('lets the owner take their own photo down', async () => {
    const written: { recipeId?: string; change?: CoverChange } = {};

    const result = await new RemoveRecipePhotoUseCase(repo(OWNER, written)).execute({
      recipeId: 'recipe-1',
      mediaId: 'media-1',
      requesterId: OWNER,
    });

    expect(result.ok).toBe(true);
    // Both ids reach the repository: the media id alone would let the owner of
    // one recipe delete a row out of another's gallery by guessing it.
    expect(written).toEqual({ recipeId: 'recipe-1', change: { image: 'https://x/cover.jpg', dropMediaIds: ['media-1'] } });
  });

  it('refuses anyone who does not own the recipe', async () => {
    const written: { recipeId?: string; change?: CoverChange } = {};

    const result = await new RemoveRecipePhotoUseCase(repo('someone-else', written)).execute({
      recipeId: 'recipe-1',
      mediaId: 'media-1',
      requesterId: OWNER,
    });

    expect(result.ok).toBe(false);
    expect(written).toEqual({});
  });

  /**
   * The symptom: a recipe made with photos has its cover set to the first one.
   * Removing that photo deleted the gallery row and left the cover pointing at
   * it, so the photo the owner had just removed stayed on every card.
   */
  it('moves the cover on when the removed photo was the cover', async () => {
    const written: { recipeId?: string; change?: CoverChange } = {};

    await new RemoveRecipePhotoUseCase(repo(OWNER, written, 'https://x/1.jpg')).execute({
      recipeId: 'recipe-1',
      mediaId: 'media-1',
      requesterId: OWNER,
    });

    expect(written.change).toEqual({ image: 'https://x/2.jpg', dropMediaIds: ['media-1'] });
  });

  // The symptom: a stale screen deleting a photo that was already gone was
  // answered 204, as if it had worked.
  it('answers not_found for an id that is not in this recipe\'s gallery', async () => {
    const written: { recipeId?: string; change?: CoverChange } = {};

    const result = await new RemoveRecipePhotoUseCase(repo(OWNER, written)).execute({
      recipeId: 'recipe-1',
      mediaId: 'not-mine',
      requesterId: OWNER,
    });

    expect(!result.ok && result.failure.messageKey).toBe('errors.not_found.photo');
    expect(written).toEqual({});
  });
});
