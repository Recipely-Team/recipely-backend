import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { CommentLikeRepositoryInterface } from '@domain/likes/comment-like-repository-interface';
import type { CommentRepositoryInterface } from '@domain/comments/comment-repository-interface';

export class LikeCommentUseCase {
  constructor(
    private readonly likes: CommentLikeRepositoryInterface,
    private readonly comments: CommentRepositoryInterface,
  ) {}

  async execute(userId: string, commentId: string): Promise<Result<void, Failure>> {
    // Verify the comment exists (and is not soft-deleted) before liking it.
    const commentResult = await this.comments.getById(commentId);
    if (!commentResult.ok) return commentResult;

    return this.likes.add(userId, commentId);
  }
}
