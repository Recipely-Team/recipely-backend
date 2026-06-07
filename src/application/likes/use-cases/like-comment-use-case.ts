import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { ICommentLikeRepository } from '@domain/likes/i-comment-like-repository';
import type { ICommentRepository } from '@domain/comments/i-comment-repository';

export class LikeCommentUseCase {
  constructor(
    private readonly likes: ICommentLikeRepository,
    private readonly comments: ICommentRepository,
  ) {}

  async execute(userId: string, commentId: string): Promise<Result<void, Failure>> {
    // Verify the comment exists (and is not soft-deleted) before liking it.
    const commentResult = await this.comments.getById(commentId);
    if (!commentResult.ok) return commentResult;

    return this.likes.add(userId, commentId);
  }
}
