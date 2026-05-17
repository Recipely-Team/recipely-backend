import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import type { ModerationStatus } from '@domain/recipes/moderation-status';

export interface CommentProps {
  readonly id: string;
  readonly body: string;
  readonly moderationStatus: ModerationStatus;
  readonly recipeId: string;
  readonly authorId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date;
}

export class Comment extends Entity<CommentProps> {
  private constructor(props: CommentProps) {
    super(props);
  }

  static create(props: CommentProps): Result<Comment, ValidationFailure> {
    if (props.id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'id'));
    }
    if (props.body.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.body_required', 'body'));
    }
    if (props.body.length > 2000) {
      return fail(new ValidationFailure('errors.validation.body_too_long', 'body'));
    }
    if (props.recipeId.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.recipe_id_required', 'recipeId'));
    }
    if (props.authorId.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.author_id_required', 'authorId'));
    }
    return ok(new Comment(props));
  }

  get body(): string { return this.props.body; }
  get moderationStatus(): ModerationStatus { return this.props.moderationStatus; }
  get recipeId(): string { return this.props.recipeId; }
  get authorId(): string { return this.props.authorId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  get deletedAt(): Date | undefined { return this.props.deletedAt; }

  toRaw(): CommentProps {
    return this.props;
  }
}
