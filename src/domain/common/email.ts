import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(private readonly raw: string) {}

  static create(raw: string): Result<Email, ValidationFailure> {
    const normalized = raw.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      return fail(new ValidationFailure('errors.validation.email_invalid', 'email'));
    }
    return ok(new Email(normalized));
  }

  get value(): string {
    return this.raw;
  }
}
