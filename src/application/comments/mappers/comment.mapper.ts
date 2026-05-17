import type { Comment } from '@domain/comments/comment';
import type { CommentDto } from '@application/comments/dtos/comment.dto';

export class CommentMapper {
  static toDto(comment: Comment): CommentDto {
    const raw = comment.toRaw();
    return {
      id: comment.id,
      body: raw.body,
      moderationStatus: raw.moderationStatus,
      recipeId: raw.recipeId,
      authorId: raw.authorId,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }
}
