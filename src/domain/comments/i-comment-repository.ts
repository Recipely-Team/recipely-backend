import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Comment } from './comment';

export interface CommentPageResult {
  readonly items: Comment[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ICommentRepository {
  create(comment: Comment): Promise<Result<Comment, Failure>>;
  getById(id: string): Promise<Result<Comment, Failure>>;
  listByRecipe(recipeId: string, page: number, pageSize: number): Promise<Result<CommentPageResult, Failure>>;
  softDelete(id: string): Promise<Result<void, Failure>>;
}
