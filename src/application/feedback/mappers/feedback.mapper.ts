import type { Feedback } from '@domain/feedback/feedback';
import type { FeedbackDto } from '@application/feedback/dtos/feedback.dto';

export class FeedbackMapper {
  static toDto(feedback: Feedback): FeedbackDto {
    const raw = feedback.toRaw();
    return {
      id: feedback.id,
      userId: raw.userId,
      category: raw.category,
      subject: raw.subject ?? null,
      message: raw.message,
      rating: raw.rating ?? null,
      contactEmail: raw.contactEmail ?? null,
      status: raw.status,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }
}
