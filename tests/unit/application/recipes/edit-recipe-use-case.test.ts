import { ok } from '@core/result/result';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { PublishBlocker } from '@domain/recipes/publishing/publish-blocker';
import type { Recipe } from '@domain/recipes/recipe';
import { EditRecipeUseCase } from '@application/recipes/editing/edit-recipe-use-case';
import { recipe, recipeProps, webImportProps, OWNER } from '../../fixtures/recipe-fixture';

/** `PATCH /recipes/:id`: the owner rewrites a recipe while it is private. */

const repoHolding = (r: Recipe) => {
  const saved: Recipe[] = [];
  return {
    saved,
    getById: jest.fn(async () => ok({ recipe: r, social: { likeCount: 0, likedByMe: false, commentCount: 0 } })),
    saveContent: jest.fn(async (edited: Recipe) => {
      saved.push(edited);
      return ok(undefined);
    }),
  };
};
const wordList = (blocked?: string) => ({
  moderate: jest.fn(({ text }: { text: string }) =>
    text === blocked
      ? { status: ModerationStatus.Rejected, hit: { category: 'profanity', term: text } }
      : { status: ModerationStatus.Approved },
  ),
});
const edit = (repo: ReturnType<typeof repoHolding>, moderator = wordList()) =>
  new EditRecipeUseCase(repo as never, moderator as never);

describe('editing a private recipe', () => {
  it('saves the owner\'s changes and answers the edited recipe', async () => {
    const repo = repoHolding(recipe(recipeProps()));

    const result = await edit(repo).execute({
      recipeId: 'recipe-1',
      requesterId: OWNER,
      changes: { name: { en: 'Better pasta' }, servings: 4 },
      locale: 'en',
    });

    expect(result.ok && result.value).toMatchObject({ name: 'Better pasta', servings: 4, publishBlockers: [] });
    expect(repo.saved[0]?.localize('en').name).toBe('Better pasta');
  });

  it('refuses anyone but the owner, and writes nothing', async () => {
    const repo = repoHolding(recipe(recipeProps()));

    const result = await edit(repo).execute({
      recipeId: 'recipe-1', requesterId: 'someone-else', changes: { servings: 4 }, locale: 'en',
    });

    expect(!result.ok && result.failure.code).toBe('forbidden');
    expect(repo.saveContent).not.toHaveBeenCalled();
  });

  it('refuses a published recipe with edit_published, and writes nothing', async () => {
    const repo = repoHolding(recipe(recipeProps({ isPublished: true, moderationStatus: ModerationStatus.Approved })));

    const result = await edit(repo).execute({
      recipeId: 'recipe-1', requesterId: OWNER, changes: { servings: 4 }, locale: 'en',
    });

    expect(!result.ok && [result.failure.code, result.failure.messageKey]).toEqual(['conflict', 'errors.recipe.edit_published']);
    expect(repo.saveContent).not.toHaveBeenCalled();
  });

  it('clears the copyright blockers the new text answers, and only those', async () => {
    const repo = repoHolding(recipe(webImportProps()));

    const result = await edit(repo).execute({
      recipeId: 'recipe-1',
      requesterId: OWNER,
      changes: { ingredients: { en: ['my own list'] }, instructions: { en: ['my own steps'] } },
      locale: 'en',
    });

    expect(result.ok && result.value.publishBlockers).toEqual([PublishBlocker.Photo]);
    // The fingerprint is not the edit's to change.
    expect(repo.saved[0]?.toRaw().importedIngredientsHash).toBe(webImportProps().importedIngredientsHash);
  });

  it('runs the local content moderator over the new text and refuses a blocked word', async () => {
    const repo = repoHolding(recipe(recipeProps()));
    const moderator = wordList('badword');

    const result = await edit(repo, moderator).execute({
      recipeId: 'recipe-1', requesterId: OWNER, changes: { instructions: { en: ['stir', 'badword'] } }, locale: 'en',
    });

    expect(!result.ok && result.failure.messageKey).toBe('errors.validation.content_blocked');
    expect(moderator.moderate).toHaveBeenCalledWith({ text: 'badword', context: 'recipe' });
    expect(repo.saveContent).not.toHaveBeenCalled();
  });

  it('keeps a private recipe unreviewed: the AI moderator runs at publish, not here', async () => {
    const repo = repoHolding(recipe(recipeProps({ moderationStatus: ModerationStatus.Pending })));

    await edit(repo).execute({ recipeId: 'recipe-1', requesterId: OWNER, changes: { servings: 3 }, locale: 'en' });

    expect(repo.saved[0]?.moderationStatus).toBe(ModerationStatus.Unreviewed);
  });
});
