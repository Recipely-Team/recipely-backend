import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IPasswordResetTokenRepository } from '@domain/auth/i-password-reset-token-repository';
import type { IEmailSender } from '@application/auth/ports/i-email-sender';
import crypto from 'crypto';

export interface ForgotPasswordInput {
  readonly email: string;
  readonly appBaseUrl: string;
}

export class ForgotPasswordUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly emailSender: IEmailSender,
  ) {}

  async execute(input: ForgotPasswordInput): Promise<Result<void, Failure>> {
    // Always return ok to prevent email enumeration
    const userResult = await this.authRepo.findByEmail(input.email);
    if (!userResult.ok || userResult.value === null) return ok(undefined);

    const user = userResult.value;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const createResult = await this.tokenRepo.create(user.id, token, expiresAt);
    if (!createResult.ok) return ok(undefined); // silent fail

    const resetUrl = `${input.appBaseUrl}/reset-password?token=${token}`;

    // Best-effort email send
    try {
      await this.emailSender.send({
        to: input.email,
        subject: 'Recipely — Reset your password',
        html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
        text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
      });
    } catch {
      // intentionally swallowed — don't leak error info
    }

    return ok(undefined);
  }
}
