import { ok } from '@core/result/result';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { UserFollowRepositoryInterface } from '@domain/users/user-follow-repository-interface';
import type { UserProfileRepositoryInterface } from '@application/users/ports/user-profile-repository-interface';
import type { NotificationService } from '@application/notifications/notification-service';
import type { TranslationService } from '@application/i18n/translation-service';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { NotifyFollowersOfNewRecipe } from '@application/users/followers/notify-followers-of-new-recipe';

/**
 * Following a creator promised their new recipes and delivered nothing. A
 * recipe going public now tells each follower, in their own language, once.
 */
const recipe = (isPublished: boolean) =>
  ({ ownerId: 'chef', isPublished, localize: (l: string) => ({ name: l === 'tr' ? 'Menemen' : 'Turkish eggs' }) }) as unknown as Recipe;

const setup = (published: boolean) => {
  const notify = jest.fn();
  const notifier = new NotifyFollowersOfNewRecipe(
    { getById: async () => ok({ recipe: recipe(published), social: {} }) } as unknown as RecipeRepositoryInterface,
    { listFollowersWithLocale: async () => ok([{ userId: 'a', locale: 'tr' }, { userId: 'b', locale: null }]) } as unknown as UserFollowRepositoryInterface,
    { getProfile: async () => ok({ displayName: 'Refika' }) } as unknown as UserProfileRepositoryInterface,
    { notify } as unknown as NotificationService,
    { t: (key: string, locale: string, vars: Record<string, string>) => `${locale}:${key}:${Object.values(vars).join()}` } as unknown as TranslationService,
    { warn: jest.fn() } as unknown as LoggerInterface,
  );
  return { notifier, notify };
};

describe('NotifyFollowersOfNewRecipe', () => {
  it('tells every follower once, in the language their device last used, English when unknown', async () => {
    const { notifier, notify } = setup(true);
    await expect(notifier.notifyNow('r1', false)).resolves.toBe(2);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'a', type: 'creator_recipe', recipeId: 'r1', dedupe: true,
      title: 'tr:notifications.creator_recipe.title:Refika', body: 'tr:notifications.creator_recipe.body:Menemen',
    }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'b', body: 'en:notifications.creator_recipe.body:Turkish eggs' }));
  });

  // Saving privately is not publishing: nobody hears about a draft.
  it('stays quiet about a recipe saved private', async () => {
    const { notifier, notify } = setup(false);
    await expect(notifier.notifyNow('r1', true)).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
