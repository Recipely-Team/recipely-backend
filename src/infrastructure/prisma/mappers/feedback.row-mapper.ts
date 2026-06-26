import type { Feedback as FeedbackRow } from '@prisma/client';
import { isFail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Feedback } from '@domain/feedback/feedback';
import { isFeedbackCategory } from '@domain/feedback/feedback-category';
import { isFeedbackStatus } from '@domain/feedback/feedback-status';
import { logger } from '@presentation/server/logger';

export class FeedbackRowMapper {
  static toDomain(row: FeedbackRow): Result<Feedback, Failure> {
    const category = isFeedbackCategory(row.category) ? row.category : 'other' as const;
    if (!isFeedbackCategory(row.category)) {
      logger.warn({ rowId: row.id, category: row.category }, 'FeedbackRowMapper: corrupt category coerced to "other"');
    }
    const status = isFeedbackStatus(row.status) ? row.status : 'new' as const;
    if (!isFeedbackStatus(row.status)) {
      logger.warn({ rowId: row.id, status: row.status }, 'FeedbackRowMapper: corrupt status coerced to "new"');
    }

    const result = Feedback.create({
      id: row.id,
      userId: row.userId,
      category,
      message: row.message,
      status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.subject !== null ? { subject: row.subject } : {}),
      ...(row.rating !== null && row.rating !== undefined ? { rating: row.rating } : {}),
      ...(row.contactEmail !== null ? { contactEmail: row.contactEmail } : {}),
    });

    if (isFail(result)) {
      logger.error({ rowId: row.id, validationFailure: result.failure }, 'FeedbackRowMapper: domain entity creation failed on DB row');
      return { ok: false, failure: new UnknownFailure(`Corrupt feedback row ${row.id}`) };
    }
    return result;
  }
}
