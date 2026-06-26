import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Feedback } from '@domain/feedback/feedback';

export interface IFeedbackRepository {
  create(feedback: Feedback): Promise<Result<Feedback, Failure>>;
}
