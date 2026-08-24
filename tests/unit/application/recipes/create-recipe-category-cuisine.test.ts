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
import type { IRecipeRepository, UserPreferences } from '@domain/recipes/i-recipe-repository';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import type { IContentModerator } from '@application/moderation/ports/i-content-moderator';
import type { ILogger } from '@application/ports/i-logger';
import type { RecipePageResult, RecipeQuery } from '@domain/recipes/recipe-query';
import { fail as failResult } from '@core/result/result';
import { UnknownFailure as UnknownFail } from '@core/failure';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import type { INotificationRepository } from '@application/notifications/ports/i-notification-repository';
import {
  CreateRecipeUseCase,
} from '@application/recipes/use-cases/create-recipe-use-case';

/**
 * Publishing from a draft is opt-in, so every case that passes no `fromDraftId`
 * never touches these. They exist so the use case can be constructed.
 */
const noDrafts = (): IRecipeDraftRepository => ({
  upsert: jest.fn(),
  getById: jest.fn().mockResolvedValue(failResult(new UnknownFail('no draft'))),
  listByOwner: jest.fn(), getLatestByOwner: jest.fn(), delete: jest.fn(),
} as unknown as IRecipeDraftRepository);

const noNotifications = (): INotificationRepository => ({
  create: jest.fn(), exists: jest.fn(), listForUser: jest.fn(), countUnread: jest.fn(),
  markAllRead: jest.fn(), markRead: jest.fn(), softDeleteByCommentId: jest.fn(),
  repointDraftToRecipe: jest.fn(),
} as unknown as INotificationRepository);

// ---- fixtures ---------------------------------------------------------------

const OWNER_ID = 'owner-1';

function approvedModerator(): IRecipeModerator {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return ok({ status: 'approved' });
    },
  };
}

function makeLogger(): ILogger {
  return { warn: jest.fn() };
}

function approvingContentModerator(): IContentModerator {
  return { moderate: () => ({ status: 'approved' }) };
}

function makeCreateRepo(capturedRef?: { recipe: Recipe | undefined }): IRecipeRepository {
  return {
    list: jest.fn<Promise<Result<RecipePageResult, Failure>>, [RecipeQuery]>(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn<Promise<Result<UserPreferences, Failure>>, [string]>(),
    listWithoutNutrition: jest.fn(),
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
