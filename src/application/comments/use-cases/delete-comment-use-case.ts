import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { CommentRepositoryInterface } from '@domain/comments/comment-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { NotificationRepositoryInterface } from '@application/notifications/ports/notification-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';

export interface DeleteCommentInput {
  readonly commentId: string;
  readonly requesterId: string;
}

export class DeleteCommentUseCase {
  constructor(
    private readonly commentRepo: CommentRepositoryInterface,
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly notificationRepo: NotificationRepositoryInterface,
    private readonly logger: LoggerInterface,
  ) {}

  /**
   * Admin-panel deletion: an admin is neither the comment's author nor the
   * recipe's owner, so the ownership guard is skipped — but the delete still
   * goes through softDelete, keeping Recipe.commentCount and the notification
   * cleanup consistent, unlike a raw AdminJS delete.
   *
   * Deliberately its own method rather than a flag on DeleteCommentInput: the
   * public input type then cannot express the bypass at all, so no controller
   * can ever spread a client-supplied `asAdmin` into it.
   */
  async executeAsAdmin(commentId: string): Promise<Result<void, Failure>> {
    return this.run(commentId, '', true);
  }

  async execute(input: DeleteCommentInput): Promise<Result<void, Failure>> {
    return this.run(input.commentId, input.requesterId, false);
  }

  private async run(
    commentId: string,
    requesterId: string,
    asAdmin: boolean,
  ): Promise<Result<void, Failure>> {
    const commentResult = await this.commentRepo.getById(commentId);
    if (!commentResult.ok) return commentResult;
    const comment = commentResult.value;

    // Pass requesterId so an owner/author can still resolve their own
    // unpublished recipe — getById hides unpublished rows from others.
    const recipeResult = await this.recipeRepo.getById(comment.recipeId, requesterId);
    if (!recipeResult.ok) return recipeResult;
    const recipe = recipeResult.value.recipe;

    const isAuthor = requesterId === comment.authorId;
    const isOwner = requesterId === recipe.ownerId;
    if (!asAdmin && !isAuthor && !isOwner) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const softDeleteResult = await this.commentRepo.softDelete(commentId);
    if (!softDeleteResult.ok) return softDeleteResult;

    // Best-effort: notification cleanup must never undo a comment delete that
    // already succeeded — log and move on.
    const notificationResult = await this.notificationRepo.softDeleteByCommentId(commentId);
    if (!notificationResult.ok) {
      this.logger.warn(
        { code: notificationResult.failure.code, messageKey: notificationResult.failure.messageKey, commentId: commentId },
        'delete_comment_notification_cleanup_failed',
      );
    }

    return ok(undefined);
  }
}
