import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { RecipeVisibility } from '@domain/recipes/recipe-visibility';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeModeratorInterface } from '@application/recipes/ports/recipe-moderator-interface';
import { CreateRecipeUseCase, type CreateRecipeInput } from '@application/recipes/use-cases/create-recipe-use-case';
import { PublishRecipeUseCase } from '@application/recipes/publishing/publish-recipe-use-case';
import { UnpublishRecipeUseCase } from '@application/recipes/publishing/unpublish-recipe-use-case';

/**
 * Saving and publishing are separate steps. A recipe someone saves is theirs
 * alone until they publish it; the AI moderator runs at that moment, not
 * before — and anyone but the owner is refused both ways.
 */
const OWNER = 'user-1';
const STRANGER = 'user-2';

const input = (overrides: Partial<CreateRecipeInput> = {}): CreateRecipeInput => ({
  ownerId: OWNER,
  name: { en: 'Pasta' },
  cuisine: 'ITALIAN',
  category: 'MAIN_COURSE',
  difficulty: 'EASY',
  ingredients: { en: ['pasta', 'sauce'] },
  instructions: { en: ['boil', 'serve'] },
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  image: '',
  ...overrides,
});

const moderatorSaying = (answer: 'approved' | 'rejected' | 'meaningless' | 'error') => ({
  moderate: jest.fn(async () => {
    if (answer === 'error') return fail(new UnknownFailure('errors.ai.upstream_failed'));
    if (answer === 'approved') return ok({ status: ModerationStatus.Approved });
    if (answer === 'meaningless') return ok({ status: ModerationStatus.Rejected, kind: 'meaningless', reason: 'x' });
    return ok({ status: ModerationStatus.Rejected, reason: 'unsafe' });
  }),
}) as unknown as RecipeModeratorInterface & { moderate: jest.Mock };

const repoWith = (): RecipeRepositoryInterface & { created: Recipe[] } => {
  const created: Recipe[] = [];
  return {
    created,
    create: jest.fn(async (r: Recipe) => {
      created.push(r);
      return ok(r);
    }),
    getById: jest.fn(async () => ok({ recipe: created[0]!, social: {} })),
    setModerationStatus: jest.fn(async () => ok({ ownerId: OWNER })),
  } as unknown as RecipeRepositoryInterface & { created: Recipe[] };
};

const logger = { warn: jest.fn() };
const approvingText = { moderate: () => ({ status: ModerationStatus.Approved }) };
const noDrafts = { getById: jest.fn(async () => fail(new UnknownFailure('none'))) };
const create = (repo: RecipeRepositoryInterface, moderator: RecipeModeratorInterface) =>
  new CreateRecipeUseCase(repo, moderator, logger, approvingText as never, noDrafts as never, {} as never);

describe('saving privately', () => {
  it('keeps the recipe to its owner and asks no moderator', async () => {
    const repo = repoWith();
    const moderator = moderatorSaying('approved');

    const r = await create(repo, moderator).execute(input({ visibility: RecipeVisibility.Private }));

    expect(r.ok).toBe(true);
    expect(moderator.moderate).not.toHaveBeenCalled();
    expect(repo.created[0]?.isPublished).toBe(false);
    expect(repo.created[0]?.moderationStatus).toBe(ModerationStatus.Unreviewed);
    if (r.ok) expect(r.value.isPublished).toBe(false);
  });

  // Older app builds send no visibility and expect the recipe published.
  it('publishes at creation for a client that does not say, as it always did', async () => {
    const repo = repoWith();

    await create(repo, moderatorSaying('approved')).execute(input());

    expect(repo.created[0]?.isPublished).toBe(true);
    expect(repo.created[0]?.moderationStatus).toBe(ModerationStatus.Approved);
  });
});

describe('publishing a saved recipe', () => {
  const saved = async (): Promise<RecipeRepositoryInterface & { created: Recipe[] }> => {
    const repo = repoWith();
    await create(repo, moderatorSaying('approved')).execute(input({ visibility: RecipeVisibility.Private }));
    return repo;
  };

  it.each([
    ['approved', ModerationStatus.Approved, true],
    ['error', ModerationStatus.Pending, false],
    ['rejected', ModerationStatus.Rejected, false],
  ] as const)('moderator %s → %s, public: %s', async (answer, status, isPublished) => {
    const repo = await saved();
    const id = repo.created[0]!.id;

    const r = await new PublishRecipeUseCase(repo, moderatorSaying(answer), logger).execute({ recipeId: id, requesterId: OWNER });

    expect(r.ok && r.value).toEqual({ isPublished, moderationStatus: status });
    expect(repo.setModerationStatus).toHaveBeenCalledWith(id, status, isPublished);
  });

  it('tells the owner a meaningless name, rather than shelving the recipe', async () => {
    const repo = await saved();
    const r = await new PublishRecipeUseCase(repo, moderatorSaying('meaningless'), logger).execute({ recipeId: repo.created[0]!.id, requesterId: OWNER });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.recipe.name_meaningless');
    expect(repo.setModerationStatus).not.toHaveBeenCalled();
  });

  it('refuses anyone but the owner, before moderation runs', async () => {
    const repo = await saved();
    const moderator = moderatorSaying('approved');

    const r = await new PublishRecipeUseCase(repo, moderator, logger).execute({ recipeId: repo.created[0]!.id, requesterId: STRANGER });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.forbidden');
    expect(moderator.moderate).not.toHaveBeenCalled();
    expect(repo.setModerationStatus).not.toHaveBeenCalled();
  });
});

describe('unpublishing', () => {
  it('takes it back to private and clears the old approval', async () => {
    const repo = repoWith();
    await create(repo, moderatorSaying('approved')).execute(input());
    const id = repo.created[0]!.id;

    const r = await new UnpublishRecipeUseCase(repo).execute({ recipeId: id, requesterId: OWNER });

    expect(r.ok && r.value).toEqual({ isPublished: false, moderationStatus: ModerationStatus.Unreviewed });
    expect(repo.setModerationStatus).toHaveBeenCalledWith(id, ModerationStatus.Unreviewed, false);
  });

  it('refuses anyone but the owner', async () => {
    const repo = repoWith();
    await create(repo, moderatorSaying('approved')).execute(input());

    const r = await new UnpublishRecipeUseCase(repo).execute({ recipeId: repo.created[0]!.id, requesterId: STRANGER });

    expect(r.ok).toBe(false);
    expect(repo.setModerationStatus).not.toHaveBeenCalled();
  });
});

// A decision already made is not the owner's to re-roll: the AI's answer can
// change between calls, so a rejection that could be resubmitted — or cleared
// by unpublishing first — was a way to retry past moderation, an admin's
// included.
describe('decisions that stand', () => {
  const inState = (moderationStatus: string, isPublished: boolean) => {
    const recipe = { ownerId: OWNER, moderationStatus, isPublished, textForReview: () => ({ title: 'x', ingredients: [], instructions: [] }) };
    return {
      getById: jest.fn(async () => ok({ recipe, social: {} })),
      setModerationStatus: jest.fn(async () => ok({ ownerId: OWNER })),
    } as unknown as RecipeRepositoryInterface;
  };

  it('refuses to publish a rejected recipe, and asks no moderator', async () => {
    const repo = inState(ModerationStatus.Rejected, false);
    const moderator = moderatorSaying('approved');

    const r = await new PublishRecipeUseCase(repo, moderator, logger).execute({ recipeId: 'r1', requesterId: OWNER });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.recipe.publish_rejected');
    expect(moderator.moderate).not.toHaveBeenCalled();
    expect(repo.setModerationStatus).not.toHaveBeenCalled();
  });

  it('leaves a recipe waiting for a person to that person', async () => {
    const repo = inState(ModerationStatus.Pending, false);
    const moderator = moderatorSaying('approved');

    const r = await new PublishRecipeUseCase(repo, moderator, logger).execute({ recipeId: 'r1', requesterId: OWNER });

    expect(r.ok && r.value).toEqual({ isPublished: false, moderationStatus: ModerationStatus.Pending });
    expect(moderator.moderate).not.toHaveBeenCalled();
  });

  it('does not re-judge a recipe that is already public', async () => {
    const repo = inState(ModerationStatus.Approved, true);
    const moderator = moderatorSaying('rejected');

    const r = await new PublishRecipeUseCase(repo, moderator, logger).execute({ recipeId: 'r1', requesterId: OWNER });

    expect(r.ok && r.value).toEqual({ isPublished: true, moderationStatus: ModerationStatus.Approved });
    expect(moderator.moderate).not.toHaveBeenCalled();
  });

  it('keeps a rejection when the owner unpublishes', async () => {
    const repo = inState(ModerationStatus.Rejected, false);

    const r = await new UnpublishRecipeUseCase(repo).execute({ recipeId: 'r1', requesterId: OWNER });

    expect(r.ok && r.value).toEqual({ isPublished: false, moderationStatus: ModerationStatus.Rejected });
    expect(repo.setModerationStatus).toHaveBeenCalledWith('r1', ModerationStatus.Rejected, false);
  });
});
