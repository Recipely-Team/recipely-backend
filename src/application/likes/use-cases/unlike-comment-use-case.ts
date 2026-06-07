import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { ICommentLikeRepository } from '@domain/likes/i-comment-like-repository';

export class UnlikeCommentUseCase {
  constructor(private readonly likes: ICommentLikeRepository) {}

  async execute(userId: string, commentId: string): Promise<Result<void, Failure>> {
    return this.likes.remove(userId, commentId);
  }
}
