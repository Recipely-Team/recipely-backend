import type { Comment as CommentRow } from '@prisma/client';
import { isFail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Comment } from '@domain/comments/comment';
import { isModerationStatus, type ModerationStatus } from '@domain/recipes/moderation-status';
import { logger } from '@presentation/server/logger';

export class CommentRowMapper {
  static toDomain(row: CommentRow): Result<Comment, Failure> {
    const rawModerationStatus = (row as { moderationStatus?: unknown }).moderationStatus;
    const moderationStatus: ModerationStatus = isModerationStatus(rawModerationStatus)
      ? rawModerationStatus
      : 'approved';

    const result = Comment.create({
      id: row.id,
      body: row.body,
      moderationStatus,
      recipeId: row.recipeId,
      authorId: row.authorId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.deletedAt !== null ? { deletedAt: row.deletedAt } : {}),
    });

    if (isFail(result)) {
      logger.error({ rowId: row.id, validationFailure: result.failure }, 'CommentRowMapper: domain entity creation failed on DB row');
      return { ok: false, failure: new UnknownFailure(`Corrupt comment row ${row.id}`) };
    }
    return result;
  }
}
