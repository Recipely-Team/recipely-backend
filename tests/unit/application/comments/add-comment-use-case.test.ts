import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, ValidationFailure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeWithSocial } from '@domain/recipes/recipe-query';
import { Comment } from '@domain/comments/comment';
import type { CommentRepositoryInterface, CommentPageResult } from '@domain/comments/comment-repository-interface';
import type { CommentModeratorInterface } from '@application/comments/ports/comment-moderator-interface';
import type { ModerationVerdict } from '@application/recipes/ports/recipe-moderator-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { WordListContentModerator } from '@infrastructure/moderation/word-list-content-moderator';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { NotificationService } from '@application/notifications/notification-service';
import { User } from '@domain/auth/user';
import { Email } from '@domain/common/email';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { NotificationRepositoryInterface } from '@application/notifications/ports/notification-repository-interface';
import type { PushNotifierInterface } from '@application/notifications/ports/push-notifier-interface';
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
  repo: RecipeRepositoryInterface;
} {
  const found = options.found !== undefined ? options.found : withSocial(makeRecipe());

  const repo: RecipeRepositoryInterface = {
    setNutrition: async () => ({ ok: true, value: undefined }),
    addMedia: async () => ({ ok: true, value: { id: 'm1', type: 'image' as const, url: 'u', position: 0 } }),
    removeMedia: async () => ({ ok: true, value: undefined }),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    setModerationStatus: jest.fn(),
    incrementViewCount: jest.fn(),

    async getById(): Promise<Result<RecipeWithSocial, Failure>> {
      if (found === null) return fail(new NotFoundFailure('errors.recipe.not_found'));
      return ok(found);
    },
  };

  return { repo };
}

function makeCommentRepo(options: { createResult?: Result<Comment, Failure> } = {}): {
  repo: CommentRepositoryInterface;
  createCalls: () => Comment[];
} {
  const createCalls: Comment[] = [];

  const repo: CommentRepositoryInterface = {
    getById: jest.fn(),
    listByRecipe: jest.fn<Promise<Result<CommentPageResult, Failure>>, [string, number, number, string?]>(),
    softDelete: jest.fn<Promise<Result<void, Failure>>, [string]>(),
    setModerationStatus: jest.fn(),

    async create(comment): Promise<Result<Comment, Failure>> {
      createCalls.push(comment);
      return options.createResult ?? ok(comment);
    },
  };

  return { repo, createCalls: () => createCalls };
}

function makeModerator(options: { result?: Result<ModerationVerdict, Failure> } = {}): {
  moderator: CommentModeratorInterface;
} {
  const result: Result<ModerationVerdict, Failure> = options.result ?? ok({ status: 'approved' });
  const moderator: CommentModeratorInterface = {
    async moderate(): Promise<Result<ModerationVerdict, Failure>> {
      return result;
    },
  };
  return { moderator };
}

function makeContentModerator(): ContentModeratorInterface {
  return { moderate: () => ({ status: 'approved' }) };
}

function makeLogger(): { logger: LoggerInterface; warnCalls: () => Array<{ context: Record<string, unknown>; message: string }> } {
  const warnCalls: Array<{ context: Record<string, unknown>; message: string }> = [];
  const logger: LoggerInterface = {
    warn(context, message): void {
      warnCalls.push({ context, message });
    },
  };
  return { logger, warnCalls: () => warnCalls };
}

function makeNotificationService(): {
  notificationService: NotificationService;
  notifyCreateCalls: () => Array<{ recipientId: string; type: string; senderId?: string; recipeId?: string; commentId?: string; message?: string }>;
} {
  const notifyCreateCalls: Array<{ recipientId: string; type: string; senderId?: string; recipeId?: string; commentId?: string; message?: string }> = [];

  const notificationRepo: NotificationRepositoryInterface = {
    async create(input): Promise<Result<void, Failure>> {
      notifyCreateCalls.push(input);
      return ok(undefined);
    },
    exists: jest.fn(),
    listForUser: jest.fn(),
    countUnread: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
    softDeleteByCommentId: jest.fn(),
    repointDraftToRecipe: jest.fn(),
  };

  const pushNotifier: PushNotifierInterface = {
    async sendToUser(): Promise<Result<void, Failure>> {
      return ok(undefined);
    },
  };

  const notificationService = new NotificationService(notificationRepo, pushNotifier);
  return { notificationService, notifyCreateCalls: () => notifyCreateCalls };
}

// A small delay so fire-and-forget `.catch(() => {})` promises resolve before assertions.
const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

function makeAuthor(displayName = 'Buse', photoUrl: string | null = 'https://x/y.jpg'): User {
  const emailResult = Email.create('author@example.com');
  if (!emailResult.ok) throw new Error('fixture email invalid');
  const result = User.create({
    id: AUTHOR_ID,
    email: emailResult.value,
    displayName,
    photoUrl,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  });
  if (!result.ok) throw new Error('fixture user invalid');
  return result.value;
}

function makeAuthRepo(user: User | null = makeAuthor()): AuthRepositoryInterface {
  return { findById: jest.fn().mockResolvedValue(ok(user)) } as unknown as AuthRepositoryInterface;
}

// ---- tests: happy path ---------------------------------------------------------

describe('AddCommentUseCase — happy path', () => {
  it('returns ok with a CommentDto when the recipe exists and moderation approves', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, makeAuthRepo(), makeContentModerator());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toBe('Looks delicious');
    expect(result.value.recipeId).toBe(RECIPE_ID);
    expect(result.value.authorId).toBe(AUTHOR_ID);
    expect(result.value.moderationStatus).toBe('approved');
    expect(result.value.authorDisplayName).toBe('Buse');
    expect(result.value.authorPhotoUrl).toBe('https://x/y.jpg');
  });

  it('defaults authorDisplayName to empty string and authorPhotoUrl to null when the author cannot be resolved', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, makeAuthRepo(null), makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

    await useCase.execute(makeInput());

    expect(createCalls()[0]?.toRaw()).not.toHaveProperty('rating');
  });

  it('sets the rating on the created comment when input.rating is present', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, notificationService, makeAuthRepo(), makeContentModerator());

    await useCase.execute(makeInput());
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

  it('carries the persisted comment id so the app can deep-link to the comment', async () => {
    const recipe = makeRecipe({ ownerId: 'owner-uuid' });
    const { repo: recipeRepo } = makeRecipeRepo({ found: withSocial(recipe) });
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const { notificationService, notifyCreateCalls } = makeNotificationService();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, notificationService, makeAuthRepo(), makeContentModerator());

    await useCase.execute(makeInput());
    await flush();

    const persistedId = createCalls()[0]?.id;
    expect(persistedId).toBeDefined();
    expect(notifyCreateCalls()[0]?.commentId).toBe(persistedId);
  });

  it('does not notify when the commenter is the recipe owner', async () => {
    const recipe = makeRecipe({ ownerId: AUTHOR_ID });
    const { repo: recipeRepo } = makeRecipeRepo({ found: withSocial(recipe) });
    const { repo: commentRepo } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const { notificationService, notifyCreateCalls } = makeNotificationService();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, notificationService, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, notificationService, null, makeContentModerator());

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
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, null, makeContentModerator());

    const result = await useCase.execute(makeInput());
    await flush();

    expect(result.ok).toBe(true);
  });
});

// ---- tests: deterministic content moderation -----------------------------------

describe('AddCommentUseCase — content moderation', () => {
  // The real word-list moderator, not a stub: this is the regression guard for
  // the slur that slipped past the Groq-only moderation.
  const realContentModerator = new WordListContentModerator();

  it.each(['sik', 's.i.k', 'siktir git', '5ik'])('rejects %p without persisting or calling the AI moderator', async (body) => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const aiModerateSpy = jest.spyOn(moderator, 'moderate');
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, makeAuthRepo(), realContentModerator);

    const result = await useCase.execute(makeInput({ body }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.content_blocked');
    expect(createCalls()).toHaveLength(0);
    expect(aiModerateSpy).not.toHaveBeenCalled();
  });

  it('still accepts an ordinary Turkish comment containing "sık"', async () => {
    const { repo: recipeRepo } = makeRecipeRepo();
    const { repo: commentRepo, createCalls } = makeCommentRepo();
    const { moderator } = makeModerator();
    const { logger } = makeLogger();
    const useCase = new AddCommentUseCase(commentRepo, recipeRepo, moderator, logger, null, makeAuthRepo(), realContentModerator);

    const result = await useCase.execute(makeInput({ body: 'Limonu iyice sık, çok güzel oluyor' }));

    expect(result.ok).toBe(true);
    expect(createCalls()).toHaveLength(1);
  });
});
