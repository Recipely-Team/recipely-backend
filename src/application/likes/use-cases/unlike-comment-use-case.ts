import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { CommentLikeRepositoryInterface } from '@domain/likes/comment-like-repository-interface';

export class UnlikeCommentUseCase {
  constructor(private readonly likes: CommentLikeRepositoryInterface) {}

  async execute(userId: string, commentId: string): Promise<Result<void, Failure>> {
    return this.likes.remove(userId, commentId);
  }
}
