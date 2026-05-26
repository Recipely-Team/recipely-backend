import { ok, fail, type Result } from '@core/result/result';
import { type Failure, ValidationFailure, NotFoundFailure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IPasswordResetTokenRepository } from '@domain/auth/i-password-reset-token-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';

export interface ResetPasswordInput {
  readonly token: string;
  readonly newPassword: string;
}

export class ResetPasswordUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: ResetPasswordInput): Promise<Result<void, Failure>> {
    if (input.newPassword.length < 8) {
      return fail(new ValidationFailure('errors.validation.password_too_short', 'newPassword'));
    }

    const tokenResult = await this.tokenRepo.findByToken(input.token);
    if (!tokenResult.ok) return tokenResult;
    if (!tokenResult.value) {
      return fail(new NotFoundFailure('errors.not_found.reset_token'));
    }

    const tokenData = tokenResult.value;
    if (tokenData.usedAt !== null) {
      return fail(new ValidationFailure('errors.validation.token_already_used', 'token'));
    }
    if (tokenData.expiresAt < new Date()) {
      return fail(new ValidationFailure('errors.validation.token_expired', 'token'));
    }

    const hash = await this.hasher.hash(input.newPassword);
    const updateResult = await this.authRepo.updatePassword(tokenData.userId, hash);
    if (!updateResult.ok) return updateResult;

    await this.tokenRepo.markUsed(tokenData.id);
    return ok(undefined);
  }
}
