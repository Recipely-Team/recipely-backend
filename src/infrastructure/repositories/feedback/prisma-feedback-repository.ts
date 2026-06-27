import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, type Result } from '@core/result/result';
import { UnauthorizedFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Feedback } from '@domain/feedback/feedback';
import type { IFeedbackRepository } from '@domain/feedback/i-feedback-repository';
import { FeedbackRowMapper } from '@infrastructure/prisma/mappers/feedback.row-mapper';

export class PrismaFeedbackRepository implements IFeedbackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(feedback: Feedback): Promise<Result<Feedback, Failure>> {
    try {
      const raw = feedback.toRaw();
      const row = await this.prisma.feedback.create({
        data: {
          id: feedback.id,
          userId: raw.userId,
          category: raw.category,
          message: raw.message,
          contactEmail: raw.contactEmail ?? null,
          status: raw.status,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
          ...(raw.subject !== undefined ? { subject: raw.subject } : {}),
          ...(raw.rating !== undefined ? { rating: raw.rating } : {}),
        },
      });
      return FeedbackRowMapper.toDomain(row);
    } catch (err) {
      // `feedbacks` has a single FK (feedbacks_user_id_fkey → users.id), so a
      // P2003 here means the authenticated user no longer exists in the DB
      // (e.g. a stale session after the user row was removed). Surface that as a
      // 401 so the client re-authenticates, instead of an opaque 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        return fail(new UnauthorizedFailure('errors.unauthorized.user_not_found'));
      }
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Unknown repository error'));
    }
  }
}
