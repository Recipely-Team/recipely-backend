import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { Email } from '@domain/common/email';

export interface UserProps {
  id: string;
  email: Email;
  displayName: string;
  bio?: string;
  photoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class User extends Entity<UserProps> {
  private constructor(props: UserProps) {
    super(props);
  }

  static create(props: UserProps): Result<User, ValidationFailure> {
    if (props.id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.user_id_required', 'id'));
    }
    if (props.displayName.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.display_name_required', 'displayName'));
    }
    return ok(new User(props));
  }

  get email(): Email { return this.props.email; }
  get displayName(): string { return this.props.displayName; }
  get bio(): string | undefined { return this.props.bio; }
  get photoUrl(): string | null { return this.props.photoUrl; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
