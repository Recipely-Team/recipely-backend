import { fail, ok } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import { RemoveRecipeCoverUseCase } from '@application/recipes/photos/remove-recipe-cover-use-case';
import { recipe, recipeProps, webImportProps, OWNER, SITE_PHOTO } from '../../fixtures/recipe-fixture';

/**
 * `DELETE /recipes/:id/cover`. The symptom this answers: an imported recipe's
 * cover — the site's own photo — could not be removed at all, because only
 * gallery photos had a DELETE.
 */

const repoHolding = (r: Recipe) => ({
  getById: jest.fn(async () => ok({ recipe: r, social: {} })),
  writeCover: jest.fn(async () => ok(undefined)),
});

describe('removing a recipe\'s cover', () => {
  it('lets the owner remove an imported cover, which clears the photo blocker', async () => {
    const repo = repoHolding(recipe(webImportProps()));

    const result = await new RemoveRecipeCoverUseCase(repo as never).execute({ recipeId: 'recipe-1', requesterId: OWNER });

    expect(result.ok && result.value).toEqual({ image: '', removedMediaIds: [] });
    expect(repo.writeCover).toHaveBeenCalledWith('recipe-1', { image: '', dropMediaIds: [] });
    expect(recipe(webImportProps({ image: '' })).publishBlockers()).not.toContain('photo');
  });

  it('removes the same photo from the gallery and promotes the next one', async () => {
    const media = [
      { id: 'm1', type: 'image' as const, url: SITE_PHOTO, position: 0 },
      { id: 'm2', type: 'image' as const, url: 'https://x/mine.jpg', position: 1 },
    ];
    const repo = repoHolding(recipe(webImportProps({ media })));

    const result = await new RemoveRecipeCoverUseCase(repo as never).execute({ recipeId: 'recipe-1', requesterId: OWNER });

    expect(result.ok && result.value).toEqual({ image: 'https://x/mine.jpg', removedMediaIds: ['m1'] });
  });

  it('refuses anyone but the owner, and writes nothing', async () => {
    const repo = repoHolding(recipe(recipeProps({ image: 'https://x/c.jpg', isPublished: true })));

    const result = await new RemoveRecipeCoverUseCase(repo as never).execute({ recipeId: 'recipe-1', requesterId: 'intruder' });

    expect(!result.ok && result.failure.code).toBe('forbidden');
    expect(repo.writeCover).not.toHaveBeenCalled();
  });

  it('answers not_found for a deleted recipe, which the read never returns', async () => {
    const repo = {
      getById: jest.fn(async () => fail(new NotFoundFailure('errors.not_found.recipe'))),
      writeCover: jest.fn(),
    };

    const result = await new RemoveRecipeCoverUseCase(repo as never).execute({ recipeId: 'recipe-1', requesterId: OWNER });

    expect(!result.ok && result.failure.code).toBe('not_found');
    expect(repo.writeCover).not.toHaveBeenCalled();
  });
});
