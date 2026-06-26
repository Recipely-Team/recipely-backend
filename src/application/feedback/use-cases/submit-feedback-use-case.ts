import { ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import { Feedback } from '@domain/feedback/feedback';
import { FeedbackStatus } from '@domain/feedback/feedback-status';
import { isFeedbackCategory } from '@domain/feedback/feedback-category';
import type { IFeedbackRepository } from '@domain/feedback/i-feedback-repository';
import { FeedbackMapper } from '@application/feedback/mappers/feedback.mapper';
import type { FeedbackDto } from '@application/feedback/dtos/feedback.dto';
import { randomUUID } from 'crypto';

export interface SubmitFeedbackInput {
  readonly userId: string;
  readonly category: string;
  readonly subject?: string;
  readonly message: string;
  readonly rating?: number;
  readonly contactEmail: string;
}

export class SubmitFeedbackUseCase {
  constructor(private readonly repo: IFeedbackRepository) {}

  async execute(input: SubmitFeedbackInput): Promise<Result<FeedbackDto, Failure>> {
    if (!isFeedbackCategory(input.category)) {
      return { ok: false, failure: new ValidationFailure('errors.validation.category_invalid', 'category') };
    }

    const now = new Date();
    const feedbackResult = Feedback.create({
      id: randomUUID(),
      userId: input.userId,
      category: input.category,
      message: input.message,
      contactEmail: input.contactEmail,
      status: FeedbackStatus.New,
      createdAt: now,
      updatedAt: now,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
    });
    if (!feedbackResult.ok) return feedbackResult;

    const persisted = await this.repo.create(feedbackResult.value);
    if (!persisted.ok) return persisted;

    return ok(FeedbackMapper.toDto(persisted.value));
  }
}
