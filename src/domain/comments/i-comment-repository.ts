import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Comment } from '@domain/comments/comment';
import type { PageResult } from '@domain/common/page-result';
import type { ModerationStatus } from '@domain/recipes/moderation-status';

export interface CommentWithAuthor {
  readonly comment: Comment;
  readonly authorDisplayName: string;
  readonly authorPhotoUrl: string | null;
  readonly likeCount: number;
  readonly likedByMe: boolean;
}

export type CommentPageResult = PageResult<CommentWithAuthor>;

export interface ModeratedComment {
  readonly authorId: string;
  readonly recipeId: string;
}

export interface ICommentRepository {
  create(comment: Comment): Promise<Result<Comment, Failure>>;
  getById(id: string): Promise<Result<Comment, Failure>>;
  /**
   * Lists approved comments for a recipe. When `currentUserId` is provided each
   * item's `likedByMe` reflects whether that user has liked the comment;
   * otherwise `likedByMe` is always false.
   */
  listByRecipe(
    recipeId: string,
    page: number,
    pageSize: number,
    currentUserId?: string,
  ): Promise<Result<CommentPageResult, Failure>>;
  softDelete(id: string): Promise<Result<void, Failure>>;
  /**
   * Admin-panel moderation decision. Recipe.commentCount only counts approved
   * comments, so a transition into or out of 'approved' must adjust it
   * atomically alongside the status change — mirrors create/softDelete.
   */
  setModerationStatus(id: string, status: ModerationStatus): Promise<Result<ModeratedComment, Failure>>;
}
