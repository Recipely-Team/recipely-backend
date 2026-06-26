import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import type { FeedbackCategory } from '@domain/feedback/feedback-category';
import { isFeedbackCategory } from '@domain/feedback/feedback-category';
import type { FeedbackStatus } from '@domain/feedback/feedback-status';

export interface FeedbackProps {
  readonly id: string;
  readonly userId: string;
  readonly category: FeedbackCategory;
  readonly subject?: string;
  readonly message: string;
  readonly rating?: number;
  readonly contactEmail?: string;
  readonly status: FeedbackStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Feedback extends Entity<FeedbackProps> {
  private constructor(props: FeedbackProps) {
    super(props);
  }

  static create(props: FeedbackProps): Result<Feedback, ValidationFailure> {
    if (props.id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'id'));
    }
    if (props.userId.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.user_id_required', 'userId'));
    }
    if (!isFeedbackCategory(props.category)) {
      return fail(new ValidationFailure('errors.validation.category_invalid', 'category'));
    }
    if (props.message.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.message_required', 'message'));
    }
    if (props.message.length > 5000) {
      return fail(new ValidationFailure('errors.validation.message_too_long', 'message'));
    }
    if (props.subject !== undefined && props.subject.length > 200) {
      return fail(new ValidationFailure('errors.validation.subject_too_long', 'subject'));
    }
    if (
      props.rating !== undefined &&
      (!Number.isInteger(props.rating) || props.rating < 1 || props.rating > 5)
    ) {
      return fail(new ValidationFailure('errors.validation.rating_invalid', 'rating'));
    }
    return ok(new Feedback(props));
  }

  get userId(): string { return this.props.userId; }
  get category(): FeedbackCategory { return this.props.category; }
  get subject(): string | undefined { return this.props.subject; }
  get message(): string { return this.props.message; }
  get rating(): number | undefined { return this.props.rating; }
  get contactEmail(): string | undefined { return this.props.contactEmail; }
  get status(): FeedbackStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  toRaw(): FeedbackProps {
    return this.props;
  }
}
