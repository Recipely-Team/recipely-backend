import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, ValidationFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IPendingRegistrationRepository } from '@domain/auth/i-pending-registration-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import { UserMapper } from '@application/auth/mappers/user.mapper';
import type { AuthSessionDto } from '@application/auth/dtos/auth.dto';

export interface VerifyRegistrationInput {
  readonly email: string;
  readonly code: string;
}

const MAX_VERIFY_ATTEMPTS = 5;

export class VerifyRegistrationUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly pendingRepo: IPendingRegistrationRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenSigner,
  ) {}

  async execute(input: VerifyRegistrationInput): Promise<Result<AuthSessionDto, Failure>> {
    const emailResult = Email.create(input.email);
    if (!emailResult.ok) return emailResult;
    const email = emailResult.value;

    const pendingResult = await this.pendingRepo.findByEmail(email.value);
    if (!pendingResult.ok) return pendingResult;
    const pending = pendingResult.value;
    if (!pending) {
      return fail(new NotFoundFailure('errors.not_found.pending_registration'));
    }

    if (pending.expiresAt < new Date()) {
      return fail(new ValidationFailure('errors.validation.code_expired', 'code'));
    }
    if (pending.attempts >= MAX_VERIFY_ATTEMPTS) {
      return fail(new ValidationFailure('errors.validation.code_attempts_exceeded', 'code'));
    }

    const codeOk = await this.hasher.verify(input.code, pending.codeHash);
    if (!codeOk) {
      await this.pendingRepo.incrementAttempts(pending.id);
      return fail(new ValidationFailure('errors.validation.code_invalid', 'code'));
    }

    // Re-check for a race: another request may have created the user between
    // the request and verify steps.
    const existsResult = await this.authRepo.existsByEmail(email);
    if (!existsResult.ok) return existsResult;
    if (existsResult.value) {
      return fail(new ConflictFailure('errors.conflict.email_exists'));
    }

    const created = await this.authRepo.createUser({
      email,
      passwordHash: pending.passwordHash,
      displayName: pending.displayName,
    });
    if (!created.ok) return created;

    await this.pendingRepo.deleteByEmail(email.value);

    const user = created.value;
    const token = await this.tokens.sign({ sub: user.id, email: user.email.value });

    return ok({ token, user: UserMapper.toDto(user) });
  }
}
