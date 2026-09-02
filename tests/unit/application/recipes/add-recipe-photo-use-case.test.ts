import { AddRecipePhotoUseCase } from '@application/recipes/use-cases/add-recipe-photo-use-case';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { ImageModeratorInterface } from '@application/ai/ports/image-moderator-interface';
import type { RecipePhotoStoreInterface } from '@application/recipes/ports/recipe-photo-store-interface';

/**
 * Adding a photo after publishing is the only way back into a recipe's gallery
 * now that editing is gone — so it is also the only place a user can put an
 * unreviewed picture on the site. The order of the three steps is the design:
 * prepare in memory, judge those exact bytes, and only then write.
 */

const OWNER = 'owner-1';
const RECIPE = 'recipe-1';
const UPLOAD = Buffer.from('raw-upload');
const PREPARED = Buffer.from('resized-jpeg');

const steps: string[] = [];

const repoWithOwner = (ownerId: string): RecipeRepositoryInterface =>
  ({
    getById: async () => ({ ok: true, value: { recipe: { ownerId } } }),
    setNutrition: async () => ({ ok: true, value: undefined }),
    addMedia: async () => {
      steps.push('store-row');
      return { ok: true, value: { id: 'm1', type: 'image' as const, url: 'u', position: 0 } };
    },
  }) as unknown as RecipeRepositoryInterface;

const photoStore = (): RecipePhotoStoreInterface => ({
  mimeType: 'image/jpeg',
  prepare: async () => {
    steps.push('prepare');
    return PREPARED;
  },
  save: async () => {
    steps.push('save-file');
    return 'https://example.test/uploads/x.jpg';
  },
});

const moderator = (verdict: 'approved' | 'rejected' | 'unavailable'): ImageModeratorInterface => ({
  moderate: async (req) => {
    steps.push(`moderate:${req.image.toString()}`);
    if (verdict === 'unavailable') {
      return { ok: false, failure: { code: 'service_unavailable' } as never };
    }
    return verdict === 'approved'
      ? { ok: true, value: { status: 'approved' } }
      : { ok: true, value: { status: 'rejected', reason: 'nope' } };
  },
});

beforeEach(() => {
  steps.length = 0;
});

describe('adding a photo to a published recipe', () => {
  it('prepares, judges, and only then writes anything', async () => {
    const useCase = new AddRecipePhotoUseCase(repoWithOwner(OWNER), photoStore(), moderator('approved'));

    const result = await useCase.execute({ recipeId: RECIPE, requesterId: OWNER, upload: UPLOAD });

    expect(result.ok).toBe(true);
    expect(steps).toEqual(['prepare', `moderate:${PREPARED.toString()}`, 'save-file', 'store-row']);
  });

  // Checking the upload and storing a re-encode of it would be checking a
  // different picture from the one that gets served.
  it('shows the moderator the bytes that will be served, not the upload', async () => {
    const useCase = new AddRecipePhotoUseCase(repoWithOwner(OWNER), photoStore(), moderator('approved'));

    await useCase.execute({ recipeId: RECIPE, requesterId: OWNER, upload: UPLOAD });

    expect(steps).toContain(`moderate:${PREPARED.toString()}`);
    expect(steps).not.toContain(`moderate:${UPLOAD.toString()}`);
  });

  it('never writes a rejected photo, to disk or to the gallery', async () => {
    const useCase = new AddRecipePhotoUseCase(repoWithOwner(OWNER), photoStore(), moderator('rejected'));

    const result = await useCase.execute({ recipeId: RECIPE, requesterId: OWNER, upload: UPLOAD });

    expect(result.ok).toBe(false);
    expect(steps).not.toContain('save-file');
    expect(steps).not.toContain('store-row');
  });

  /**
   * The one that matters most. "We could not check it" must never become "it is
   * fine" — the cost of refusing is one retry, and the cost of the other
   * reading is whatever the photo turns out to be.
   */
  it('refuses the upload when the moderator could not answer', async () => {
    const useCase = new AddRecipePhotoUseCase(repoWithOwner(OWNER), photoStore(), moderator('unavailable'));

    const result = await useCase.execute({ recipeId: RECIPE, requesterId: OWNER, upload: UPLOAD });

    expect(result.ok).toBe(false);
    expect(steps).not.toContain('save-file');
  });

  // Refused because it is not their recipe, without spending a vision call to
  // find out the picture was fine.
  it('turns a stranger away before it looks at the photo', async () => {
    const useCase = new AddRecipePhotoUseCase(
      repoWithOwner('someone-else'),
      photoStore(),
      moderator('approved'),
    );

    const result = await useCase.execute({ recipeId: RECIPE, requesterId: OWNER, upload: UPLOAD });

    expect(result.ok).toBe(false);
    expect(steps).toEqual([]);
  });
});
