import { fail, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { IFcmTokenRepository } from '@application/notifications/ports/i-fcm-token-repository';

const VALID_PLATFORMS = new Set(['ios', 'android', 'web']);

export interface RegisterFcmTokenInput {
  readonly userId: string;
  readonly token: string;
  readonly platform: string;
}

export class RegisterFcmTokenUseCase {
  constructor(private readonly fcmTokenRepo: IFcmTokenRepository) {}

  async execute(input: RegisterFcmTokenInput): Promise<Result<void, Failure>> {
    if (input.token.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.token_required', 'token'));
    }
    if (!VALID_PLATFORMS.has(input.platform)) {
      return fail(new ValidationFailure('errors.validation.platform_invalid', 'platform'));
    }
    return this.fcmTokenRepo.register(input.userId, input.token, input.platform);
  }
}
