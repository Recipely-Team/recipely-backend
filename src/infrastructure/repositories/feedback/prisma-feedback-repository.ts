import type { PrismaClient } from '@prisma/client';
import { fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
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
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Unknown repository error'));
    }
  }
}
