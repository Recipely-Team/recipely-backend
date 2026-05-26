import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IRecipeLikeRepository } from '@domain/likes/i-recipe-like-repository';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { NotificationService } from '@application/notifications/notification-service';

export class LikeRecipeUseCase {
  constructor(
    private readonly likes: IRecipeLikeRepository,
    private readonly recipes: IRecipeRepository,
    private readonly notificationService: NotificationService | null = null,
  ) {}

  async execute(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    // Verify the recipe exists before liking it.
    const recipeResult = await this.recipes.getById(recipeId);
    if (!recipeResult.ok) return recipeResult;
    const recipe = recipeResult.value.recipe;

    const likeResult = await this.likes.add(userId, recipeId);

    // Notify the recipe owner if different from the liker — fire-and-forget.
    if (likeResult.ok && this.notificationService !== null && recipe.ownerId !== userId) {
      this.notificationService.notify({
        recipientId: recipe.ownerId,
        type: 'like',
        senderId: userId,
        recipeId,
        title: 'New like',
        body: 'Someone liked your recipe.',
      }).catch(() => {});
    }

    return likeResult;
  }
}
