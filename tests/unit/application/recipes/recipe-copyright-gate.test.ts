import { ok } from '@core/result/result';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { RecipeOrigin } from '@domain/recipes/recipe-origin';
import { SourcePlatform } from '@domain/recipes/source-platform';
import { PublishBlocker } from '@domain/recipes/publishing/publish-blocker';
import { fingerprintLines } from '@domain/recipes/publishing/content-fingerprint';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeDraft } from '@domain/drafts/recipe-draft';
import { PublishRecipeUseCase } from '@application/recipes/publishing/publish-recipe-use-case';
import { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import { CompleteImportJobUseCase } from '@application/imports/use-cases/complete-import-job-use-case';
import { ImportJob } from '@domain/imports/import-job';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { recipe, recipeProps, webImportProps, OWNER, SITE_INGREDIENTS, SITE_PHOTO, SITE_STEPS } from '../../fixtures/recipe-fixture';

/**
 * A recipe imported from a web page may be saved privately, but it is not
 * published while the site's photo, ingredient list or steps are still on it.
 */

const repoHolding = (r: Recipe) => ({
  getById: jest.fn(async () => ok({ recipe: r, social: { likeCount: 0, likedByMe: false, commentCount: 0 } })),
  setModerationStatus: jest.fn(async () => ok({ ownerId: OWNER })),
  incrementViewCount: jest.fn(async () => ok(undefined)),
});
const approving = () => ({ moderate: jest.fn(async () => ok({ status: ModerationStatus.Approved })) });
const publish = (repo: ReturnType<typeof repoHolding>, moderator = approving()) =>
  new PublishRecipeUseCase(repo as never, moderator as never, { warn: jest.fn() } as never);

describe('publishing a web import', () => {
  it('is refused with the checklist, before the moderator is asked anything', async () => {
    const repo = repoHolding(recipe(webImportProps()));
    const moderator = approving();

    const result = await publish(repo, moderator).execute({ recipeId: 'recipe-1', requesterId: OWNER });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('conflict');
    expect(result.failure.messageKey).toBe('errors.recipe.publish_blocked_copyright');
    expect(moderator.moderate).not.toHaveBeenCalled();
    expect(repo.setModerationStatus).not.toHaveBeenCalled();
    // The client renders the checklist from the 409 body.
    expect(failureToHttp(result.failure)).toEqual({
      status: 409,
      body: {
        error: {
          code: 'conflict',
          message: 'errors.recipe.publish_blocked_copyright',
          messageKey: 'errors.recipe.publish_blocked_copyright',
          details: { blockers: [PublishBlocker.Photo, PublishBlocker.Ingredients, PublishBlocker.Instructions] },
        },
      },
    });
  });

  it('names only what is left', async () => {
    const repo = repoHolding(recipe(webImportProps({ image: '', ingredients: { en: ['my own'] } })));

    const result = await publish(repo).execute({ recipeId: 'recipe-1', requesterId: OWNER });

    expect(!result.ok && (result.failure as { details?: unknown }).details).toEqual({
      blockers: [PublishBlocker.Instructions],
    });
  });

  it('goes through to moderation once every blocker is cleared', async () => {
    const cleared = webImportProps({
      image: 'https://api.test/uploads/mine.jpg',
      ingredients: { en: ['my own list'] },
      instructions: { en: ['my own steps'] },
    });
    const repo = repoHolding(recipe(cleared));
    const moderator = approving();

    const result = await publish(repo, moderator).execute({ recipeId: 'recipe-1', requesterId: OWNER });

    expect(result.ok && result.value).toEqual({ isPublished: true, moderationStatus: ModerationStatus.Approved });
    expect(moderator.moderate).toHaveBeenCalledTimes(1);
  });

  it('never gates a video import carrying the same text and photo', async () => {
    const repo = repoHolding(recipe(webImportProps({ sourcePlatform: SourcePlatform.Instagram })));

    const result = await publish(repo).execute({ recipeId: 'recipe-1', requesterId: OWNER });

    expect(result.ok).toBe(true);
  });

  it('never gates a web import saved before the gate existed (NULL fingerprint)', async () => {
    const legacy = webImportProps({ importedImage: null, importedIngredientsHash: null, importedInstructionsHash: null });

    const result = await publish(repoHolding(recipe(legacy))).execute({ recipeId: 'recipe-1', requesterId: OWNER });

    expect(result.ok).toBe(true);
  });
});

describe('publishBlockers on the recipe detail', () => {
  it('is sent to the owner, so the checklist shows before they tap Publish', async () => {
    const result = await new GetRecipeUseCase(repoHolding(recipe(webImportProps())) as never).execute('recipe-1', 'en', OWNER);

    expect(result.ok && result.value.publishBlockers).toEqual([
      PublishBlocker.Photo,
      PublishBlocker.Ingredients,
      PublishBlocker.Instructions,
    ]);
  });

  it('is an empty list for an owner with nothing left to do', async () => {
    const result = await new GetRecipeUseCase(repoHolding(recipe(recipeProps())) as never).execute('recipe-1', 'en', OWNER);

    expect(result.ok && result.value.publishBlockers).toEqual([]);
  });

  it('is absent for anyone else, signed in or not', async () => {
    const r = recipe(webImportProps({ isPublished: true }));
    const stranger = await new GetRecipeUseCase(repoHolding(r) as never).execute('recipe-1', 'en', 'someone-else');
    const guest = await new GetRecipeUseCase(repoHolding(r) as never).execute('recipe-1', 'en');

    expect(stranger.ok && 'publishBlockers' in stranger.value).toBe(false);
    expect(guest.ok && 'publishBlockers' in guest.value).toBe(false);
  });
});

describe('the fingerprint, from import to recipe', () => {
  const WORKER = 'worker-a';
  const claimedJob = (): ImportJob => {
    const queued = ImportJob.queue({ id: 'job-1', ownerId: OWNER, url: 'https://site.test/pasta', locale: 'en', now: new Date() });
    if (!queued.ok) throw new Error('fixture');
    const claimed = queued.value.claim(WORKER, new Date());
    if (!claimed.ok) throw new Error('fixture');
    return claimed.value;
  };
  const complete = async (sourcePlatform: (typeof SourcePlatform)[keyof typeof SourcePlatform]) => {
    const drafts: RecipeDraft[] = [];
    const useCase = new CompleteImportJobUseCase(
      { getById: jest.fn(async () => ok(claimedJob())), save: jest.fn(async (j: ImportJob) => ok(j)) } as never,
      { upsert: jest.fn(async (d: RecipeDraft) => { drafts.push(d); return ok(d); }) } as never,
      { save: jest.fn(async () => SITE_PHOTO) } as never,
      { notify: jest.fn(async () => undefined) } as never,
      { t: (k: string) => k } as never,
      { warn: jest.fn() } as never,
    );
    await useCase.execute({
      jobId: 'job-1',
      workerId: WORKER,
      locale: 'en',
      coverFrameJpegBase64: Buffer.from('jpeg').toString('base64'),
      sourcePlatform,
      aiWritten: false,
      recipe: {
        title: 'Pasta', cuisine: 'ITALIAN', category: 'MAIN_COURSE', difficulty: 'EASY',
        prepTimeMinutes: 5, cookTimeMinutes: 10, servings: 2,
        ingredients: [...SITE_INGREDIENTS], instructions: [...SITE_STEPS],
        tags: [], mealType: [], tips: [], caloriesPerServing: 0, nutrition: { protein: 0, carbs: 0, fat: 0, fiber: 0 },
      } as never,
    });
    return drafts[0]!.snapshot;
  };

  it('stamps a web import at completion with the stored cover and the text digests', async () => {
    const snapshot = await complete(SourcePlatform.Web);

    expect(snapshot).toMatchObject({
      importedImage: SITE_PHOTO,
      importedIngredientsHash: fingerprintLines(SITE_INGREDIENTS),
      importedInstructionsHash: fingerprintLines(SITE_STEPS),
    });
  });

  it('does not stamp a video import', async () => {
    const snapshot = await complete(SourcePlatform.TikTok);

    expect(snapshot.importedImage).toBeUndefined();
    expect(snapshot.importedIngredientsHash).toBeUndefined();
  });

  const createFrom = (snapshot: RecipeDraft['snapshot'], draftOwner = OWNER, moderator = approving()) => {
    const created: Recipe[] = [];
    const useCase = new CreateRecipeUseCase(
      { create: jest.fn(async (r: Recipe) => { created.push(r); return ok(r); }) } as never,
      moderator as never,
      { warn: jest.fn() } as never,
      { moderate: () => ({ status: ModerationStatus.Approved }) } as never,
      {
        getById: jest.fn(async () => ok({ id: 'draft-1', ownerId: draftOwner, snapshot })),
        delete: jest.fn(async () => ok(undefined)),
      } as never,
      { repointDraftToRecipe: jest.fn(async () => ok(undefined)) } as never,
    );
    const run = (visibility?: 'public' | 'private') =>
      useCase.execute({
        ownerId: OWNER,
        name: { en: 'Pasta' },
        cuisine: 'ITALIAN',
        category: 'MAIN_COURSE',
        difficulty: 'EASY',
        ingredients: { en: [...SITE_INGREDIENTS] },
        instructions: { en: [...SITE_STEPS] },
        prepTimeMinutes: 5,
        cookTimeMinutes: 10,
        image: SITE_PHOTO,
        fromDraftId: 'draft-1',
        ...(visibility !== undefined ? { visibility } : {}),
      });
    return { created, run, moderator };
  };

  /**
   * The symptom: `POST /recipes` without `visibility` (every build from before
   * the save/publish split) published at creation and never asked the gate, so
   * an unchanged web draft went straight to the feed. It is now saved private
   * instead — refused would have lost the recipe on an old build.
   */
  it.each([[undefined], ['public' as const]])(
    'saves a gated recipe PRIVATE when create asks for public (visibility %s)',
    async (visibility) => {
      const { created, run, moderator } = createFrom(await complete(SourcePlatform.Web));

      const result = await run(visibility);

      expect(result.ok).toBe(true);
      expect(created[0]?.isPublished).toBe(false);
      expect(created[0]?.moderationStatus).toBe(ModerationStatus.Unreviewed);
      expect(moderator.moderate).not.toHaveBeenCalled();
    },
  );

  it('still publishes at creation when nothing blocks', async () => {
    const { created, run } = createFrom({});

    await run();

    expect(created[0]?.isPublished).toBe(true);
  });

  // A draft id is a UUID in the body; someone else's draft must neither lend
  // its provenance nor its fingerprint to this recipe.
  it('ignores a draft the creator does not own: the recipe reads as hand-written', async () => {
    const { created, run } = createFrom(await complete(SourcePlatform.Web), 'someone-else');

    await run('private');

    expect(created[0]?.toRaw()).toMatchObject({ origin: RecipeOrigin.User, sourcePlatform: null });
    expect(created[0]?.toRaw().importedImage ?? null).toBeNull();
  });

  it('is carried onto the recipe saved from that draft, which is then gated', async () => {
    const snapshot = await complete(SourcePlatform.Web);
    const created: Recipe[] = [];
    const useCase = new CreateRecipeUseCase(
      { create: jest.fn(async (r: Recipe) => { created.push(r); return ok(r); }) } as never,
      approving() as never,
      { warn: jest.fn() } as never,
      { moderate: () => ({ status: ModerationStatus.Approved }) } as never,
      {
        getById: jest.fn(async () => ok({ id: 'draft-1', ownerId: OWNER, snapshot })),
        delete: jest.fn(async () => ok(undefined)),
      } as never,
      { repointDraftToRecipe: jest.fn(async () => ok(undefined)) } as never,
    );

    const result = await useCase.execute({
      ownerId: OWNER,
      name: { en: 'Pasta' },
      cuisine: 'ITALIAN',
      category: 'MAIN_COURSE',
      difficulty: 'EASY',
      ingredients: { en: [...SITE_INGREDIENTS] },
      instructions: { en: [...SITE_STEPS] },
      prepTimeMinutes: 5,
      cookTimeMinutes: 10,
      image: SITE_PHOTO,
      fromDraftId: 'draft-1',
      visibility: 'private',
    });

    expect(created[0]?.toRaw()).toMatchObject({ origin: RecipeOrigin.Import, importedImage: SITE_PHOTO });
    expect(created[0]?.publishBlockers()).toHaveLength(3);
    expect(result.ok && result.value.publishBlockers).toHaveLength(3);
  });
});
