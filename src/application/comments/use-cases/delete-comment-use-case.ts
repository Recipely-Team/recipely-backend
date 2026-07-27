import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { ICommentRepository } from '@domain/comments/i-comment-repository';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { INotificationRepository } from '@application/notifications/ports/i-notification-repository';
import type { ILogger } from '@application/ports/i-logger';

export interface DeleteCommentInput {
  readonly commentId: string;
  readonly requesterId: string;
}

export class DeleteCommentUseCase {
  constructor(
    private readonly commentRepo: ICommentRepository,
    private readonly recipeRepo: IRecipeRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(input: DeleteCommentInput): Promise<Result<void, Failure>> {
    const commentResult = await this.commentRepo.getById(input.commentId);
    if (!commentResult.ok) return commentResult;
    const comment = commentResult.value;

    // Pass requesterId so an owner/author can still resolve their own
    // unpublished recipe — getById hides unpublished rows from others.
    const recipeResult = await this.recipeRepo.getById(comment.recipeId, input.requesterId);
    if (!recipeResult.ok) return recipeResult;
    const recipe = recipeResult.value.recipe;

    const isAuthor = input.requesterId === comment.authorId;
    const isOwner = input.requesterId === recipe.ownerId;
    if (!isAuthor && !isOwner) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const softDeleteResult = await this.commentRepo.softDelete(input.commentId);
    if (!softDeleteResult.ok) return softDeleteResult;

    // Best-effort: notification cleanup must never undo a comment delete that
    // already succeeded — log and move on.
    const notificationResult = await this.notificationRepo.softDeleteByCommentId(input.commentId);
    if (!notificationResult.ok) {
      this.logger.warn(
        { code: notificationResult.failure.code, messageKey: notificationResult.failure.messageKey, commentId: input.commentId },
        'delete_comment_notification_cleanup_failed',
      );
    }

    return ok(undefined);
  }
}
