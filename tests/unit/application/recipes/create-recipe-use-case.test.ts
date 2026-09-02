import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeModeratorInterface, ModerateRecipeRequest } from '@application/recipes/ports/recipe-moderator-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { WordListContentModerator } from '@infrastructure/moderation/word-list-content-moderator';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { CreateRecipeUseCase, type CreateRecipeInput } from '@application/recipes/use-cases/create-recipe-use-case';
import { fail as failResult } from '@core/result/result';
import { UnknownFailure as UnknownFail } from '@core/failure';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import type { NotificationRepositoryInterface } from '@application/notifications/ports/notification-repository-interface';

/**
 * Publishing from a draft is opt-in, so every case that passes no `fromDraftId`
 * never touches these. They exist so the use case can be constructed.
 */
const noDrafts = (): RecipeDraftRepositoryInterface => ({
  upsert: jest.fn(),
  getById: jest.fn().mockResolvedValue(failResult(new UnknownFail('no draft'))),
  listByOwner: jest.fn(), getLatestByOwner: jest.fn(), delete: jest.fn(),
} as unknown as RecipeDraftRepositoryInterface);

const noNotifications = (): NotificationRepositoryInterface => ({
  create: jest.fn(), exists: jest.fn(), listForUser: jest.fn(), countUnread: jest.fn(),
  markAllRead: jest.fn(), markRead: jest.fn(), softDeleteByCommentId: jest.fn(),
  repointDraftToRecipe: jest.fn(),
} as unknown as NotificationRepositoryInterface);


// ---- helpers ----------------------------------------------------------------

function makeInput(overrides: Partial<CreateRecipeInput> = {}): CreateRecipeInput {
  return {
    ownerId: 'user-1',
    name: { en: 'Pasta' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] },
    instructions: { en: ['boil', 'serve'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    image: 'https://example.com/pasta.jpg',
    ...overrides,
  };
}

/** Captures the last recipe passed to create() so tests can inspect it. */
function makeRepo(createOverride?: (recipe: Recipe) => Promise<Result<Recipe, Failure>>): {
  repo: RecipeRepositoryInterface;
  capturedRecipe: () => Recipe | undefined;
} {
  let captured: Recipe | undefined;

  const repo: RecipeRepositoryInterface = {
    setNutrition: async () => ({ ok: true, value: undefined }),
    addMedia: async () => ({ ok: true, value: { id: 'm1', type: 'image' as const, url: 'u', position: 0 } }),
    removeMedia: async () => ({ ok: true, value: undefined }),
    list: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    setModerationStatus: jest.fn(),
    incrementViewCount: jest.fn(),
    async create(recipe): Promise<Result<Recipe, Failure>> {
      captured = recipe;
      if (createOverride) return createOverride(recipe);
      return ok(recipe);
    },
  };

  return { repo, capturedRecipe: () => captured };
}

function approvedModerator(): RecipeModeratorInterface {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return ok({ status: 'approved' });
    },
  };
}

function rejectedModerator(reason = 'unsafe content'): RecipeModeratorInterface {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return ok({ status: 'rejected', reason });
    },
  };
}

function failingModerator(): RecipeModeratorInterface {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
    },
  };
}

function makeLogger(): { logger: LoggerInterface; warn: jest.Mock } {
  const warn = jest.fn();
  return { logger: { warn }, warn };
}

function approvingContentModerator(): ContentModeratorInterface {
  return { moderate: () => ({ status: 'approved' }) };
}

// ---- tests ------------------------------------------------------------------

describe('CreateRecipeUseCase — moderator approved path', () => {
  it('returns ok with a RecipeDto when moderator approves', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus approved when moderator approves', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('approved');
  });

  it('persists the recipe with isPublished true when moderator approves', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(true);
  });

  it('the returned DTO has moderationStatus approved', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('approved');
  });
});

describe('CreateRecipeUseCase — moderator rejected path', () => {
  it('returns ok (recipe still created) when moderator rejects', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus rejected when moderator rejects', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('rejected');
  });

  it('persists the recipe with isPublished false when moderator rejects', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(false);
  });
});

describe('CreateRecipeUseCase — moderator failure (pending) path', () => {
  it('returns ok even when the moderator returns a failure', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus pending when moderator fails', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('pending');
  });

  it('persists the recipe with isPublished false when moderator fails', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(false);
  });

  it('the returned DTO has moderationStatus pending when moderator fails', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('calls logger.warn when the moderator returns a failure', async () => {
    const { repo } = makeRepo();
    const { logger, warn } = makeLogger();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), logger, approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute(makeInput());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.any(String) }),
      expect.stringContaining('create_recipe_moderation_upstream_error'),
    );
  });
});

describe('CreateRecipeUseCase — repository failure', () => {
  it('propagates the repository failure when create fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo(async () => fail(repoFailure));
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator(), noDrafts(), noNotifications());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});

describe('CreateRecipeUseCase — content moderation', () => {
  const realContentModerator = new WordListContentModerator();

  const makeUseCase = () => {
    const { repo, capturedRecipe } = makeRepo();
    const aiModerator = approvedModerator();
    const spy = jest.spyOn(aiModerator, 'moderate');
    return {
      useCase: new CreateRecipeUseCase(repo, aiModerator, makeLogger().logger, realContentModerator, noDrafts(), noNotifications()),
      capturedRecipe,
      spy,
    };
  };

  it('rejects profanity in the name and never persists', async () => {
    const { useCase, capturedRecipe, spy } = makeUseCase();

    const result = await useCase.execute(makeInput({ name: { en: 'siktir pasta' } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.content_blocked');
    expect(capturedRecipe()).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('checks every locale, not just the first', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute(makeInput({ name: { en: 'Pasta', tr: 'orospu makarna' } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.content_blocked');
  });

  it.each([
    ['ingredients', { ingredients: { tr: ['fare zehri', 'tuz'] } }],
    ['instructions', { instructions: { tr: ['çamaşır suyu ekle'] } }],
  ])('rejects a dangerous substance in %s with the recipe-specific message', async (_field, overrides) => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute(makeInput(overrides as Partial<CreateRecipeInput>));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.content_blocked_dangerous');
  });

  it.each([
    ['tags', { tags: { tr: ['orospu'] } }],
    ['mealType', { mealType: { tr: ['siktir'] } }],
    ['tips', { tips: { tr: ['yarrak gibi olur'] } }],
  ])('rejects profanity in %s — these reach the public DTO but the AI moderator never sees them', async (_field, overrides) => {
    const { useCase, capturedRecipe } = makeUseCase();

    const result = await useCase.execute(makeInput(overrides as Partial<CreateRecipeInput>));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.content_blocked');
    expect(capturedRecipe()).toBeUndefined();
  });

  it('accepts an ordinary Turkish recipe', async () => {
    const { useCase, capturedRecipe } = makeUseCase();

    const result = await useCase.execute(
      makeInput({
        name: { tr: 'Limonlu Tavuk' },
        ingredients: { tr: ['tavuk', 'sıkılmış limon suyu', 'kaşar peyniri'] },
        instructions: { tr: ['Limonu iyice sık', 'Fırında pişir'] },
      }),
    );

    expect(result.ok).toBe(true);
    expect(capturedRecipe()).toBeDefined();
  });
});

describe('CreateRecipeUseCase — publishing from a draft', () => {
  // An Instagram import notifies the user with the draft it produced. Publishing
  // that draft used to be a separate client-side delete, with nothing recording
  // what the draft had become — so tapping the notification afterwards opened a
  // row that publishing had removed. Naming the draft on create is what lets the
  // notification follow it to the recipe.
  const ownedDraft = (ownerId: string) => {
    const deleted: string[] = [];
    const repo = {
      getById: jest.fn().mockResolvedValue(ok({ id: 'draft-1', ownerId })),
      delete: jest.fn(async (id: string) => { deleted.push(id); return ok(undefined); }),
      upsert: jest.fn(), listByOwner: jest.fn(), getLatestByOwner: jest.fn(),
    } as unknown as RecipeDraftRepositoryInterface;
    return { repo, deleted: () => deleted };
  };

  const spyNotifications = () => {
    const calls: Array<[string, string]> = [];
    const repo = {
      create: jest.fn(), exists: jest.fn(), listForUser: jest.fn(), countUnread: jest.fn(),
      markAllRead: jest.fn(), markRead: jest.fn(), softDeleteByCommentId: jest.fn(),
      repointDraftToRecipe: jest.fn(async (d: string, r: string) => { calls.push([d, r]); return ok(undefined); }),
    } as unknown as NotificationRepositoryInterface;
    return { repo, calls: () => calls };
  };

  it('sends the draft notifications on to the recipe it became, then deletes it', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const drafts = ownedDraft('user-1');
    const notifs = spyNotifications();

    const result = await new CreateRecipeUseCase(
      repo, approvedModerator(), makeLogger().logger, approvingContentModerator(),
      drafts.repo, notifs.repo,
    ).execute(makeInput({ fromDraftId: 'draft-1' }));

    expect(result.ok).toBe(true);
    expect(notifs.calls()).toEqual([['draft-1', capturedRecipe()?.id]]);
    expect(drafts.deleted()).toEqual(['draft-1']);
  });

  it("leaves someone else's draft alone", async () => {
    const drafts = ownedDraft('another-user');
    const notifs = spyNotifications();

    await new CreateRecipeUseCase(
      makeRepo().repo, approvedModerator(), makeLogger().logger, approvingContentModerator(),
      drafts.repo, notifs.repo,
    ).execute(makeInput({ ownerId: 'user-1', fromDraftId: 'draft-1' }));

    expect(notifs.calls()).toEqual([]);
    expect(drafts.deleted()).toEqual([]);
  });

  // The recipe is saved and the user is already being told it worked; failing
  // now would report a successful publish as an error and invite a duplicate.
  it('still succeeds when retiring the draft fails', async () => {
    const drafts = {
      getById: jest.fn().mockResolvedValue(ok({ id: 'draft-1', ownerId: 'user-1' })),
      delete: jest.fn().mockResolvedValue(failResult(new UnknownFail('db down'))),
      upsert: jest.fn(), listByOwner: jest.fn(), getLatestByOwner: jest.fn(),
    } as unknown as RecipeDraftRepositoryInterface;
    const notifs = {
      create: jest.fn(), exists: jest.fn(), listForUser: jest.fn(), countUnread: jest.fn(),
      markAllRead: jest.fn(), markRead: jest.fn(), softDeleteByCommentId: jest.fn(),
      repointDraftToRecipe: jest.fn().mockResolvedValue(failResult(new UnknownFail('db down'))),
    } as unknown as NotificationRepositoryInterface;

    const result = await new CreateRecipeUseCase(
      makeRepo().repo, approvedModerator(), makeLogger().logger, approvingContentModerator(),
      drafts, notifs,
    ).execute(makeInput({ fromDraftId: 'draft-1' }));

    expect(result.ok).toBe(true);
  });

  it('touches nothing when the recipe was written from scratch', async () => {
    const drafts = ownedDraft('user-1');
    const notifs = spyNotifications();

    await new CreateRecipeUseCase(
      makeRepo().repo, approvedModerator(), makeLogger().logger, approvingContentModerator(),
      drafts.repo, notifs.repo,
    ).execute(makeInput());

    expect(notifs.calls()).toEqual([]);
    expect(drafts.deleted()).toEqual([]);
  });
});
