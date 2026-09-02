import { ok, fail } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';
import type { RecipeRepositoryInterface, ModeratedRecipe } from '@domain/recipes/recipe-repository-interface';
import { ModerateRecipeUseCase } from '@application/recipes/use-cases/moderate-recipe-use-case';
import type { NotificationService } from '@application/notifications/notification-service';

const RECIPE_ID = 'recipe-1';
const OWNER_ID = 'owner-1';

function makeRepo(setModerationStatus: RecipeRepositoryInterface['setModerationStatus']): RecipeRepositoryInterface {
  return {
    setNutrition: async () => ({ ok: true, value: undefined }),
    addMedia: async () => ({ ok: true, value: { id: 'm1', type: 'image' as const, url: 'u', position: 0 } }),
    removeMedia: async () => ({ ok: true, value: undefined }),
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),
    setModerationStatus,
  };
}

function makeNotificationService(): { service: NotificationService; notify: jest.Mock } {
  const notify = jest.fn();
  return { service: { notify } as unknown as NotificationService, notify };
}

describe('ModerateRecipeUseCase — approve', () => {
  it('publishes the recipe and notifies the owner', async () => {
    const setModerationStatus = jest.fn<Promise<ReturnType<typeof ok<ModeratedRecipe>>>, [string, string, boolean]>()
      .mockResolvedValue(ok({ ownerId: OWNER_ID }));
    const repo = makeRepo(setModerationStatus);
    const { service, notify } = makeNotificationService();
    const useCase = new ModerateRecipeUseCase(repo, service);

    const result = await useCase.execute({ recipeId: RECIPE_ID, decision: 'approved' });

    expect(result.ok).toBe(true);
    expect(setModerationStatus).toHaveBeenCalledWith(RECIPE_ID, 'approved', true);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: OWNER_ID, type: 'moderation', recipeId: RECIPE_ID }),
    );
  });
});

describe('ModerateRecipeUseCase — reject', () => {
  it('unpublishes the recipe', async () => {
    const setModerationStatus = jest.fn().mockResolvedValue(ok({ ownerId: OWNER_ID }));
    const repo = makeRepo(setModerationStatus);
    const useCase = new ModerateRecipeUseCase(repo);

    const result = await useCase.execute({ recipeId: RECIPE_ID, decision: 'rejected' });

    expect(result.ok).toBe(true);
    expect(setModerationStatus).toHaveBeenCalledWith(RECIPE_ID, 'rejected', false);
  });
});

describe('ModerateRecipeUseCase — no notification service', () => {
  it('does not throw when constructed without one', async () => {
    const setModerationStatus = jest.fn().mockResolvedValue(ok({ ownerId: OWNER_ID }));
    const repo = makeRepo(setModerationStatus);
    const useCase = new ModerateRecipeUseCase(repo);

    const result = await useCase.execute({ recipeId: RECIPE_ID, decision: 'approved' });

    expect(result.ok).toBe(true);
  });
});

describe('ModerateRecipeUseCase — repository failure', () => {
  it('propagates the failure and never notifies', async () => {
    const failure = new NotFoundFailure('errors.not_found.recipe');
    const setModerationStatus = jest.fn().mockResolvedValue(fail(failure));
    const repo = makeRepo(setModerationStatus);
    const { service, notify } = makeNotificationService();
    const useCase = new ModerateRecipeUseCase(repo, service);

    const result = await useCase.execute({ recipeId: RECIPE_ID, decision: 'approved' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(failure);
    expect(notify).not.toHaveBeenCalled();
  });
});
