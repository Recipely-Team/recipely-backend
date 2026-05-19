import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Comment } from './comment';
import type { PageResult } from '@domain/common/page-result';

export type CommentPageResult = PageResult<Comment>;

export interface ICommentRepository {
  create(comment: Comment): Promise<Result<Comment, Failure>>;
  getById(id: string): Promise<Result<Comment, Failure>>;
  listByRecipe(recipeId: string, page: number, pageSize: number): Promise<Result<CommentPageResult, Failure>>;
  softDelete(id: string): Promise<Result<void, Failure>>;
}
