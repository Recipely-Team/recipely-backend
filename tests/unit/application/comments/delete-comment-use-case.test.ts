import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeWithSocial } from '@domain/recipes/query/recipe-with-social';
import { Comment, type CommentProps } from '@domain/comments/comment';
import type { CommentRepositoryInterface, CommentPageResult } from '@domain/comments/comment-repository-interface';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { NotificationRepositoryInterface } from '@application/notifications/ports/notification-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { DeleteCommentUseCase, type DeleteCommentInput } from '@application/comments/use-cases/delete-comment-use-case';
import { RecipeOrigin } from '@domain/recipes/recipe-origin';

// ---- fixtures ----------------------------------------------------------------

const COMMENT_ID = 'comment-uuid';
const RECIPE_ID = 'recipe-uuid';
const AUTHOR_ID = 'author-uuid';
const OWNER_ID = 'owner-uuid';
const STRANGER_ID = 'stranger-uuid';

function makeCommentProps(overrides: Partial<CommentProps> = {}): CommentProps {
  return {
    id: COMMENT_ID,
    body: 'Looks delicious',
    moderationStatus: 'approved',
    recipeId: RECIPE_ID,
    authorId: AUTHOR_ID,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeComment(overrides: Partial<CommentProps> = {}): Comment {
  const result = Comment.create(makeCommentProps(overrides));
  if (!result.ok) throw new Error('fixture comment invalid: ' + result.failure.messageKey);
  return result.value;
}

function makeRecipeProps(overrides: Partial<RecipeProps> = {}): RecipeProps {
  return {
    origin: RecipeOrigin.User,
    id: RECIPE_ID,
    ownerId: OWNER_ID,
    name: { en: 'Pasta' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] },
    instructions: { en: ['boil', 'serve'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/pasta.jpg',
    rating: 4,
    tags: { en: ['quick'] },
    mealType: { en: ['dinner'] },
    media: [],
    isPublished: true,
    moderationStatus: 'approved',
    viewCount: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<RecipeProps> = {}): Recipe {
  const result = Recipe.create(makeRecipeProps(overrides));
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

const withSocial = (recipe: Recipe): RecipeWithSocial => ({
  recipe,
  social: { likeCount: 0, likedByMe: false, commentCount: 0 },
});

function makeInput(overrides: Partial<DeleteCommentInput> = {}): DeleteCommentInput {
  return {
    commentId: COMMENT_ID,
    requesterId: AUTHOR_ID,
    ...overrides,
  };
}

// ---- repo helpers --------------------------------------------------------------

function makeCommentRepo(options: {
  found?: Comment | null;
  softDeleteResult?: Result<void, Failure>;
} = {}): {
  repo: CommentRepositoryInterface;
  softDeleteCalls: () => string[];
} {
  const found = options.found !== undefined ? options.found : makeComment();
  const softDeleteCalls: string[] = [];

  const repo: CommentRepositoryInterface = {
    create: jest.fn(),
    listByRecipe: jest.fn<Promise<Result<CommentPageResult, Failure>>, [string, number, number, string?]>(),
    setModerationStatus: jest.fn(),

    async getById(): Promise<Result<Comment, Failure>> {
      if (found === null) return fail(new NotFoundFailure('errors.not_found.comment'));
      return ok(found);
    },

    async softDelete(id): Promise<Result<void, Failure>> {
      softDeleteCalls.push(id);
      return options.softDeleteResult ?? ok(undefined);
    },
  };

  return { repo, softDeleteCalls: () => softDeleteCalls };
}

function makeRecipeRepo(options: { found?: RecipeWithSocial | null } = {}): {
  repo: RecipeRepositoryInterface;
  getByIdCalls: () => string[];
} {
  const found = options.found !== undefined ? options.found : withSocial(makeRecipe());
  const getByIdCalls: string[] = [];

  const repo: RecipeRepositoryInterface = {
    setNutrition: async () => ({ ok: true, value: undefined }),
    addMedia: async () => ({ ok: true, value: { id: 'm1', type: 'image' as const, url: 'u', position: 0 } }),
    writeCover: async () => ({ ok: true, value: undefined }),
    saveContent: async () => ({ ok: true, value: undefined }),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listNeedingNutrition: jest.fn(),
    setModerationStatus: jest.fn(),
    incrementViewCount: jest.fn(),

    async getById(id): Promise<Result<RecipeWithSocial, Failure>> {
      getByIdCalls.push(id);
      if (found === null) return fail(new NotFoundFailure('errors.recipe.not_found'));
      return ok(found);
    },
  };

  return { repo, getByIdCalls: () => getByIdCalls };
}

function makeNotificationRepo(options: { softDeleteResult?: Result<void, Failure> } = {}): {
  repo: NotificationRepositoryInterface;
  softDeleteByCommentIdCalls: () => string[];
} {
  const softDeleteByCommentIdCalls: string[] = [];

  const repo: NotificationRepositoryInterface = {
    create: jest.fn(),
    exists: jest.fn(),
    listForUser: jest.fn(),
    countUnread: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),

    async softDeleteByCommentId(commentId): Promise<Result<void, Failure>> {
      softDeleteByCommentIdCalls.push(commentId);
      return options.softDeleteResult ?? ok(undefined);
    },

    repointDraftToRecipe: jest.fn(),
  };

  return { repo, softDeleteByCommentIdCalls: () => softDeleteByCommentIdCalls };
}

function makeLogger(): LoggerInterface {
  return { warn: jest.fn() };
}

// ---- tests: happy path -----------------------------------------------------------

describe('DeleteCommentUseCase — author deletes their own comment', () => {
  it('returns ok and calls softDelete with the comment id', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput({ requesterId: AUTHOR_ID }));

    expect(result.ok).toBe(true);
    expect(softDeleteCalls()).toEqual([COMMENT_ID]);
  });
});

describe('DeleteCommentUseCase — admin bypass', () => {
  it('returns ok and calls softDelete via executeAsAdmin, even though the admin is a stranger', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.executeAsAdmin(makeInput().commentId);

    expect(result.ok).toBe(true);
    expect(softDeleteCalls()).toEqual([COMMENT_ID]);
  });
});

describe('DeleteCommentUseCase — recipe owner deletes someone else\'s comment', () => {
  it('returns ok and calls softDelete when requester is the recipe owner but not the author', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput({ requesterId: OWNER_ID }));

    expect(result.ok).toBe(true);
    expect(softDeleteCalls()).toEqual([COMMENT_ID]);
  });
});

// ---- tests: ownership guard --------------------------------------------------------

describe('DeleteCommentUseCase — unauthorized requester', () => {
  it('returns ForbiddenFailure when requester is neither the author nor the recipe owner', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput({ requesterId: STRANGER_ID }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
    expect(softDeleteCalls()).toHaveLength(0);
  });
});

// ---- tests: not found paths --------------------------------------------------------

describe('DeleteCommentUseCase — comment not found', () => {
  it('returns NotFoundFailure and does not look up the recipe', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo({ found: null });
    const { repo: recipeRepo, getByIdCalls } = makeRecipeRepo();
    const { repo: notificationRepo } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(getByIdCalls()).toHaveLength(0);
    expect(softDeleteCalls()).toHaveLength(0);
  });
});

describe('DeleteCommentUseCase — recipe not found', () => {
  it('returns NotFoundFailure and does not call softDelete', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo({ found: null });
    const { repo: notificationRepo } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(softDeleteCalls()).toHaveLength(0);
  });
});

// ---- tests: repository failure propagation --------------------------------------

describe('DeleteCommentUseCase — softDelete failure', () => {
  it('propagates the failure when softDelete fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo: commentRepo } = makeCommentRepo({ softDeleteResult: fail(repoFailure) });
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});

// ---- tests: notification cleanup -------------------------------------------------

describe('DeleteCommentUseCase — notification cleanup on successful delete', () => {
  it('calls notificationRepo.softDeleteByCommentId exactly once with the deleted comment id', async () => {
    const { repo: commentRepo } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo, softDeleteByCommentIdCalls } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    expect(softDeleteByCommentIdCalls()).toEqual([COMMENT_ID]);
  });
});

describe('DeleteCommentUseCase — notification cleanup is skipped when the comment is not deleted', () => {
  it('does not call softDeleteByCommentId when commentRepo.softDelete fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo: commentRepo } = makeCommentRepo({ softDeleteResult: fail(repoFailure) });
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo, softDeleteByCommentIdCalls } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    await useCase.execute(makeInput());

    expect(softDeleteByCommentIdCalls()).toHaveLength(0);
  });

  it('does not call softDeleteByCommentId when the requester is neither the author nor the recipe owner', async () => {
    const { repo: commentRepo } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo, softDeleteByCommentIdCalls } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput({ requesterId: STRANGER_ID }));

    expect(result.ok).toBe(false);
    expect(softDeleteByCommentIdCalls()).toHaveLength(0);
  });

  it('does not call softDeleteByCommentId when the comment does not exist', async () => {
    const { repo: commentRepo } = makeCommentRepo({ found: null });
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: notificationRepo, softDeleteByCommentIdCalls } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    expect(softDeleteByCommentIdCalls()).toHaveLength(0);
  });

  it('does not call softDeleteByCommentId when the recipe does not exist', async () => {
    const { repo: commentRepo } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo({ found: null });
    const { repo: notificationRepo, softDeleteByCommentIdCalls } = makeNotificationRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, makeLogger());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    expect(softDeleteByCommentIdCalls()).toHaveLength(0);
  });
});

describe('DeleteCommentUseCase — notification cleanup failure is best-effort', () => {
  it('still returns ok and logs a warning when softDeleteByCommentId fails', async () => {
    const { repo: commentRepo } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const notificationFailure = new UnknownFailure('errors.db.write_failed');
    const { repo: notificationRepo } = makeNotificationRepo({ softDeleteResult: fail(notificationFailure) });
    const logger = makeLogger();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        code: notificationFailure.code,
        messageKey: notificationFailure.messageKey,
        commentId: COMMENT_ID,
      }),
      'delete_comment_notification_cleanup_failed',
    );
  });
});
