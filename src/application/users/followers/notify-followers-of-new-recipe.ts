import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { UserFollowRepositoryInterface } from '@domain/users/user-follow-repository-interface';
import type { UserProfileRepositoryInterface } from '@application/users/ports/user-profile-repository-interface';
import type { NotificationService } from '@application/notifications/notification-service';
import type { TranslationService } from '@application/i18n/translation-service';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { RecipeCreatedListenerInterface } from '@application/recipes/ports/recipe-created-listener-interface';
import type { RecipeWentPublicListenerInterface } from '@application/recipes/ports/recipe-went-public-listener-interface';

/** Far past any creator here today; a bound so one publish is never an unbounded fan-out. */
const MAX_FOLLOWERS = 5000;
const TITLE_KEY = 'notifications.creator_recipe.title';
const BODY_KEY = 'notifications.creator_recipe.body';

/**
 * Tells a creator's followers about a recipe the moment it goes public.
 *
 * @remarks
 * - **Why.** Following a creator promised their new recipes and delivered
 *   nothing: the follow was a counter. This is the half of the creator page
 *   that brings a follower back.
 * - **Each follower in their own language**, the one their latest device
 *   used; English when none is known yet.
 * - **Once per recipe and follower** (`dedupe`): unpublishing and publishing
 *   again does not notify a second time.
 * - **A recipe saved public on create counts**, through `created`: an older
 *   client publishes on save and never calls publish.
 */
export class NotifyFollowersOfNewRecipe implements RecipeCreatedListenerInterface, RecipeWentPublicListenerInterface {
  constructor(
    private readonly recipes: RecipeRepositoryInterface,
    private readonly follows: UserFollowRepositoryInterface,
    private readonly profiles: UserProfileRepositoryInterface,
    private readonly notifications: NotificationService,
    private readonly ts: TranslationService,
    private readonly logger: LoggerInterface,
  ) {}

  created(recipeId: string): void {
    this.run(recipeId, true);
  }

  wentPublic(recipeId: string): void {
    this.run(recipeId, false);
  }

  private run(recipeId: string, onlyIfPublic: boolean): void {
    void this.notifyNow(recipeId, onlyIfPublic).catch((err: unknown) => this.logger.warn({ err, recipeId }, 'follower_notify_failed'));
  }

  /** The awaited half; the number of followers told. */
  async notifyNow(recipeId: string, onlyIfPublic: boolean): Promise<number> {
    const found = await this.recipes.getById(recipeId);
    if (!found.ok) return 0;
    const recipe = found.value.recipe;
    if (onlyIfPublic && !recipe.isPublished) return 0;
    const followers = await this.follows.listFollowersWithLocale(recipe.ownerId, MAX_FOLLOWERS);
    if (!followers.ok) return 0;
    const profile = await this.profiles.getProfile(recipe.ownerId);
    const owner = profile.ok ? profile.value.displayName : '';
    for (const follower of followers.value) {
      const locale = follower.locale ?? 'en';
      const name = recipe.localize(locale).name;
      void this.notifications.notify({
        recipientId: follower.userId,
        type: 'creator_recipe',
        senderId: recipe.ownerId,
        recipeId,
        title: this.ts.t(TITLE_KEY, locale, { name: owner }),
        body: this.ts.t(BODY_KEY, locale, { title: name }),
        dedupe: true,
      });
    }
    return followers.value.length;
  }
}
