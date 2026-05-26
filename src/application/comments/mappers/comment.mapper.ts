import type { Comment } from '@domain/comments/comment';
import type { CommentWithAuthor } from '@domain/comments/i-comment-repository';
import type { CommentDto } from '@application/comments/dtos/comment.dto';

export class CommentMapper {
  static toDto(comment: Comment, authorDisplayName: string, authorPhotoUrl: string | null): CommentDto {
    const raw = comment.toRaw();
    return {
      id: comment.id,
      body: raw.body,
      rating: raw.rating ?? null,
      moderationStatus: raw.moderationStatus,
      recipeId: raw.recipeId,
      authorId: raw.authorId,
      authorDisplayName,
      authorPhotoUrl,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }

  static withAuthorToDto(item: CommentWithAuthor): CommentDto {
    return CommentMapper.toDto(item.comment, item.authorDisplayName, item.authorPhotoUrl);
  }
}
