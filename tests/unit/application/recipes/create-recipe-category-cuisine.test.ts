/**
 * Tests for the required `category` and `cuisine` enum fields on
 * CreateRecipeUseCase.
 *
 * The create use-case suite next door covers the happy path and the
 * moderation logic; this file covers the required-field validation the
 * filters/sort feature introduced.
 */
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface, UserPreferences } from '@domain/recipes/recipe-repository-interface';
import type { RecipeModeratorInterface, ModerateRecipeRequest } from '@application/recipes/ports/recipe-moderator-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { RecipePageResult, RecipeQuery } from '@domain/recipes/recipe-query';
import { fail as failResult } from '@core/result/result';
import { UnknownFailure as UnknownFail } from '@core/failure';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import type { NotificationRepositoryInterface } from '@application/notifications/ports/notification-repository-interface';
import {
  CreateRecipeUseCase,
} from '@application/recipes/use-cases/create-recipe-use-case';

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

// ---- fixtures ---------------------------------------------------------------

const OWNER_ID = 'owner-1';

function approvedModerator(): RecipeModeratorInterface {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return ok({ status: 'approved' });
    },
  };
}

function makeLogger(): LoggerInterface {
  return { warn: jest.fn() };
}

function approvingContentModerator(): ContentModeratorInterface {
  return { moderate: () => ({ status: 'approved' }) };
}

function makeCreateRepo(capturedRef?: { recipe: Recipe | undefined }): RecipeRepositoryInterface {
  return {
    setNutrition: async () => ({ ok: true, value: undefined }),
    addMedia: async () => ({ ok: true, value: { id: 'm1', type: 'image' as const, url: 'u', position: 0 } }),
    removeMedia: async () => ({ ok: true, value: undefined }),
    list: jest.fn<Promise<Result<RecipePageResult, Failure>>, [RecipeQuery]>(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn<Promise<Result<UserPreferences, Failure>>, [string]>(),
    listWithoutNutrition: jest.fn(),
    setModerationStatus: jest.fn(),
    incrementViewCount: jest.fn(),
    async create(recipe): Promise<Result<Recipe, Failure>> {
      if (capturedRef) capturedRef.recipe = recipe;
      return ok(recipe);
    },
  };
}

// ---- CreateRecipeUseCase — required category field --------------------------

describe('CreateRecipeUseCase — required category field', () => {
  it('persists the category enum value passed in input', async () => {
    const capturedRef = { recipe: undefined as Recipe | undefined };
    const repo = makeCreateRepo(capturedRef);
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger(), approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute({
      ownerId: OWNER_ID,
      name: { en: 'Pasta' },
      cuisine: 'ITALIAN',
      category: 'DINNER',
      difficulty: 'EASY',
      ingredients: { en: ['pasta'] },
      instructions: { en: ['boil'] },
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      image: 'https://example.com/img.jpg',
    });

    expect(capturedRef.recipe?.category).toBe('DINNER');
  });

  it('persists the cuisine enum value passed in input', async () => {
    const capturedRef = { recipe: undefined as Recipe | undefined };
    const repo = makeCreateRepo(capturedRef);
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger(), approvingContentModerator(), noDrafts(), noNotifications());

    await useCase.execute({
      ownerId: OWNER_ID,
      name: { en: 'Tacos' },
      cuisine: 'MEXICAN',
      category: 'MAIN_COURSE',
      difficulty: 'EASY',
      ingredients: { en: ['tortilla'] },
      instructions: { en: ['fill'] },
      prepTimeMinutes: 5,
      cookTimeMinutes: 10,
      image: 'https://example.com/img.jpg',
    });

    expect(capturedRef.recipe?.cuisine).toBe('MEXICAN');
  });
});
