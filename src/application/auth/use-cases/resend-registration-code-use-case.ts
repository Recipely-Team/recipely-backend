import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import type { IPendingRegistrationRepository } from '@domain/auth/i-pending-registration-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { IEmailSender } from '@application/auth/ports/i-email-sender';
import type { TranslationService } from '@application/i18n/translation-service';
import {
  CODE_TTL_MS,
  generateCode,
  remainingSeconds,
  sendVerificationEmail,
} from '@application/auth/use-cases/request-registration-use-case';

export interface ResendRegistrationCodeInput {
  readonly email: string;
  readonly locale: string;
}

export type ResendRegistrationCodeResult =
  | { readonly found: false }
  | {
      readonly found: true;
      readonly expiresInSeconds: number;
      readonly expiresAt: Date;
      readonly code?: string;
    };

export class ResendRegistrationCodeUseCase {
  constructor(
    private readonly pendingRepo: IPendingRegistrationRepository,
    private readonly hasher: IPasswordHasher,
    private readonly emailSender: IEmailSender,
    private readonly ts: TranslationService,
  ) {}

  async execute(
    input: ResendRegistrationCodeInput,
  ): Promise<Result<ResendRegistrationCodeResult, Failure>> {
    const emailResult = Email.create(input.email);
    // Invalid email cannot have a pending row — respond generically, don't leak.
    if (!emailResult.ok) return ok({ found: false });
    const email = emailResult.value;

    const pendingResult = await this.pendingRepo.findByEmail(email.value);
    if (!pendingResult.ok) return pendingResult;
    const pending = pendingResult.value;
    if (!pending) return ok({ found: false });

    const now = Date.now();
    // Code still valid → resend is locked. Return the existing expiry so the
    // client keeps the same countdown; do NOT email a second code.
    if (pending.expiresAt.getTime() > now) {
      return ok({
        found: true,
        expiresAt: pending.expiresAt,
        expiresInSeconds: remainingSeconds(pending.expiresAt, now),
      });
    }

    // Expired → issue a fresh code, reusing the stored credentials.
    const code = generateCode();
    const codeHash = await this.hasher.hash(code);
    const expiresAt = new Date(now + CODE_TTL_MS);

    const upsertResult = await this.pendingRepo.upsert({
      email: email.value,
      passwordHash: pending.passwordHash,
      displayName: pending.displayName,
      codeHash,
      expiresAt,
    });
    if (!upsertResult.ok) return upsertResult;

    await sendVerificationEmail(this.emailSender, this.ts, email.value, code, input.locale);

    return ok({
      found: true,
      expiresAt,
      expiresInSeconds: Math.round(CODE_TTL_MS / 1000),
      code,
    });
  }
}
