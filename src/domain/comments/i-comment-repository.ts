import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Comment } from './comment';
import type { PageResult } from '@domain/common/page-result';

export interface CommentWithAuthor {
  readonly comment: Comment;
  readonly authorDisplayName: string;
  readonly authorPhotoUrl: string | null;
  readonly likeCount: number;
  readonly likedByMe: boolean;
}

export type CommentPageResult = PageResult<CommentWithAuthor>;

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
}
