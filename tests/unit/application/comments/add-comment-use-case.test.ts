import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, ValidationFailure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { RecipeWithSocial } from '@domain/recipes/recipe-query';
import { Comment } from '@domain/comments/comment';
import type { ICommentRepository, CommentPageResult } from '@domain/comments/i-comment-repository';
import type { ICommentModerator } from '@application/comments/ports/i-comment-moderator';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';
import type { ILogger } from '@application/ports/i-logger';
import { NotificationService } from '@application/notifications/notification-service';
import type { INotificationRepository } from '@application/notifications/ports/i-notification-repository';
import type { IPushNotifier } from '@application/notifications/ports/i-push-notifier';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { AddCommentUseCase, type AddCommentInput } from '@application/comments/use-cases/add-comment-use-case';

// ---- fixtures ----------------------------------------------------------------

const AUTHOR_ID = 'author-uuid';
const RECIPE_ID = 'recipe-uuid';

function makeInput(overrides: Partial<AddCommentInput> = {}): AddCommentInput {
  return {
    recipeId: RECIPE_ID,
    authorId: AUTHOR_ID,
    body: 'Looks delicious',
    ...overrides,
  };
}

function makeRecipeProps(overrides: Partial<RecipeProps> = {}): RecipeProps {
  return {
    id: RECIPE_ID,
    ownerId: 'owner-uuid',
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

// ---- repo/port helpers --------------------------------------------------------

function makeRecipeRepo(options: { found?: RecipeWithSocial | null } = {}): {
  repo: IRecipeRepository;
} {
  const found = options.found !== undefined ? options.found : withSocial(makeRecipe());

  const repo: IRecipeRepository = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),

    async getById(): Promise<Result<RecipeWithSocial, Failure>> {
      if (found === null) return fail(new NotFoundFailure('errors.recipe.not_found'));
      return ok(found);
    },
  };

  return { repo };
}

function makeCommentRepo(options: { createResult?: Result<Comment, Failure> } = {}): {
  repo: ICommentRepository;
  createCalls: () => Comment[];
} {
  const createCalls: Comment[] = [];

  const repo: ICommentRepository = {
    getById: jest.fn(),
    listByRecipe: jest.fn<Promise<Result<CommentPageResult, Failure>>, [string, number, number, string?]>(),
    softDelete: jest.fn<Promise<Result<void, Failure>>, [string]>(),

    async create(comment): Promise<Result<Comment, Failure>> {
      createCalls.push(comment);
      return options.createResult ?? ok(comment);
    },
  };

  return { repo, createCalls: () => createCalls };
}

function makeModerator(options: { result?: Result<ModerationVerdict, Failure> } = {}): {
  moderator: ICommentModerator;
} {
  const result: Result<ModerationVerdict, Failure> = options.result ?? ok({ status: 'approved' });
  const moderator: ICommentModerator = {
    async moderate(): Promise<Result<ModerationVerdict, Failure>> {
      return result;
    },
  };
  return { moderator };
}

function makeLogger(): { logger: ILogger; warnCalls: () => Array<{ context: Record<string, unknown>; message: string }> } {
  const warnCalls: Array<{ context: Record<string, unknown>; message: string }> = [];
  const logger: ILogger = {
    warn(context, message): void {
      warnCalls.push({ context, message });
    },
  };
  return { logger, warnCalls: () => warnCalls };
}

function makeNotificationService(): {
  notificationService: NotificationService;
  notifyCreateCalls: () => Array<{ recipientId: string; type: string; senderId?: string; recipeId?: string; message?: string }>;
} {
  const notifyCreateCalls: Array<{ recipientId: string; type: string; senderId?: string; recipeId?: string; message?: string }> = [];

  const notificationRepo: INotificationRepository = {
    async create(input): Promise<Result<void, Failure>> {
      notifyCreateCalls.push(input);
      return ok(undefined);
    },
    exists: jest.fn(),
    listForUser: jest.fn(),
    countUnread: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
  };

  const pushNotifier: IPushNotifier = {
    async sendToUser(): Promise<Result<void, Failure>> {
      return ok(undefined);
    },
  };

  const notificationService = new NotificationService(notificationRepo, pushNotifier);
  return { notificationService, notifyCreateCalls: () => notifyCreateCalls };
}

// A small delay so fire-and-forget `.catch(() => {})` promises resolve before assertions.
const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

// ---- tests: happy path ---------------------------------------------------------

describe('AddCommentUseCase — happy path', () => {
  it('returns ok with a CommentDto when the recipe exists and moderation approves', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    const result = await useCase.execute(makeInput({ authorDisplayName: 'Buse', authorPhotoUrl: 'https://x/y.jpg' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toBe('Looks delicious');
    expect(result.value.recipeId).toBe(RECIPE_ID);
    expect(result.value.authorId).toBe(AUTHOR_ID);
    expect(result.value.moderationStatus).toBe('approved');
    expect(result.value.authorDisplayName).toBe('Buse');
    expect(result.value.authorPhotoUrl).toBe('https://x/y.jpg');
  });

  it('defaults authorDisplayName to empty string and authorPhotoUrl to null when omitted', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.authorDisplayName).toBe('');
    expect(result.value.authorPhotoUrl).toBeNull();
  });

  it('persists the comment via commentRepo.create with the input body and recipeId', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    await useCase.execute(makeInput());

    expect(createCalls()).toHaveLength(1);
    expect(createCalls()[0]?.body).toBe('Looks delicious');
    expect(createCalls()[0]?.recipeId).toBe(RECIPE_ID);
    expect(createCalls()[0]?.authorId).toBe(AUTHOR_ID);
  });

  it('does not set a rating on the created comment when input.rating is absent (exactOptionalPropertyTypes)', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    await useCase.execute(makeInput());

    expect(createCalls()[0]?.toRaw()).not.toHaveProperty('rating');
  });

  it('sets the rating on the created comment when input.rating is present', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    await useCase.execute(makeInput({ rating: 5 }));

    expect(createCalls()[0]?.toRaw().rating).toBe(5);
  });
});

// ---- tests: recipe not found ---------------------------------------------------

describe('AddCommentUseCase — recipe not found', () => {
  it('returns NotFoundFailure when the recipe does not exist', async () => {
    const { repo: recipeRepo } = makeRecipeRepo({ found: null });
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });

  it('does not call commentRepo.create when the recipe is not found', async () => {
    const { repo: recipeRepo } = makeRecipeRepo({ found: null });
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    await useCase.execute(makeInput());

    expect(createCalls()).toHaveLength(0);
  });
});

// ---- tests: moderation ----------------------------------------------------------

describe('AddCommentUseCase — moderation rejected', () => {
  it('returns UnprocessableFailure when the moderator rejects the comment', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator({ result: ok({ status: 'rejected', reason: 'spam' }) });
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(createCalls()).toHaveLength(0);
  });
});

describe('AddCommentUseCase — moderation upstream failure', () => {
  it('saves the comment as pending and still returns ok when the moderator call fails', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator({ result: fail(new UnknownFailure('errors.ai.unavailable')) });
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
    expect(createCalls()[0]?.moderationStatus).toBe('pending');
  });

  it('logs a warning when the moderator call fails', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator({ result: fail(new UnknownFailure('errors.ai.unavailable')) });
    const { logger, warnCalls } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    await useCase.execute(makeInput());

    expect(warnCalls()).toHaveLength(1);
  });
});

// ---- tests: Comment.create validation failure propagates -----------------------

describe('AddCommentUseCase — invalid comment body', () => {
  it('returns a ValidationFailure and does not persist when body is empty', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    const result = await useCase.execute(makeInput({ body: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBeInstanceOf(ValidationFailure);
    expect(createCalls()).toHaveLength(0);
  });
});

// ---- tests: repository failure propagation --------------------------------------

describe('AddCommentUseCase — commentRepo.create failure', () => {
  it('propagates the failure when commentRepo.create fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo } = makeCommentRepo({ createResult: fail(repoFailure) });
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});

// ---- tests: notification side-effects -------------------------------------------

describe('AddCommentUseCase — notifications', () => {
  it('notifies the recipe owner when the commenter is not the owner and the comment is approved', async () => {
    const recipe = makeRecipe({ ownerId: 'owner-uuid' });
    const { repo: recipeRepo } = makeRecipeRepo({ found: withSocial(recipe) });
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const { notificationService, notifyCreateCalls } = makeNotificationService();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, notificationService);

    await useCase.execute(makeInput({ authorDisplayName: 'Buse' }));
    await flush();

    expect(notifyCreateCalls()).toHaveLength(1);
    expect(notifyCreateCalls()[0]).toMatchObject({
      recipientId: 'owner-uuid',
      type: 'comment',
      senderId: AUTHOR_ID,
      recipeId: RECIPE_ID,
      message: 'Looks delicious',
    });
  });

  it('does not notify when the commenter is the recipe owner', async () => {
    const recipe = makeRecipe({ ownerId: AUTHOR_ID });
    const { repo: recipeRepo } = makeRecipeRepo({ found: withSocial(recipe) });
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const { notificationService, notifyCreateCalls } = makeNotificationService();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, notificationService);

    await useCase.execute(makeInput());
    await flush();

    expect(notifyCreateCalls()).toHaveLength(0);
  });

  it('does not notify when the comment is saved as pending (moderation upstream failure)', async () => {
    const recipe = makeRecipe({ ownerId: 'owner-uuid' });
    const { repo: recipeRepo } = makeRecipeRepo({ found: withSocial(recipe) });
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator({ result: fail(new UnknownFailure('errors.ai.unavailable')) });
    const { logger } = makeLogger();
    const { notificationService, notifyCreateCalls } = makeNotificationService();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, notificationService);

    await useCase.execute(makeInput());
    await flush();

    expect(notifyCreateCalls()).toHaveLength(0);
  });

  it('does not attempt to notify when notificationService is not provided', async () => {
    const recipe = makeRecipe({ ownerId: 'owner-uuid' });
    const { repo: recipeRepo } = makeRecipeRepo({ found: withSocial(recipe) });
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger);

    const result = await useCase.execute(makeInput());
    await flush();

    expect(result.ok).toBe(true);
  });
});
