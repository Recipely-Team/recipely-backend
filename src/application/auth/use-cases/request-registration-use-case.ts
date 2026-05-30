import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, ValidationFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IPendingRegistrationRepository } from '@domain/auth/i-pending-registration-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { IEmailSender } from '@application/auth/ports/i-email-sender';
import type { TranslationService } from '@application/i18n/translation-service';
import crypto from 'crypto';

export interface RequestRegistrationInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly locale: string;
}

export interface RequestRegistrationResult {
  readonly email: string;
  readonly expiresInSeconds: number;
  readonly expiresAt: Date;
  // Plaintext code, present only when a fresh code was generated (so dev builds
  // can surface it). Omitted on the idempotent re-request path.
  readonly code?: string;
}

const MIN_PASSWORD_LENGTH = 8;
const CODE_MIN = 100000;
const CODE_MAX = 999999;

// Verification-code lifetime. This single window also acts as the resend lock:
// a code cannot be re-requested or resent until it expires, and re-requesting
// within the window returns the SAME code's expiry (idempotent) so navigating
// back and forward never resets the timer or emails a second code.
export const CODE_TTL_MS = 3 * 60 * 1000;

export class RequestRegistrationUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly pendingRepo: IPendingRegistrationRepository,
    private readonly hasher: IPasswordHasher,
    private readonly emailSender: IEmailSender,
    private readonly ts: TranslationService,
  ) {}

  async execute(input: RequestRegistrationInput): Promise<Result<RequestRegistrationResult, Failure>> {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return fail(new ValidationFailure('errors.validation.password_too_short', 'password'));
    }
    if (input.displayName.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.display_name_required', 'displayName'));
    }

    const emailResult = Email.create(input.email);
    if (!emailResult.ok) return emailResult;
    const email = emailResult.value;

    const existsResult = await this.authRepo.existsByEmail(email);
    if (!existsResult.ok) return existsResult;
    if (existsResult.value) {
      return fail(new ConflictFailure('errors.conflict.email_exists'));
    }

    const pendingResult = await this.pendingRepo.findByEmail(email.value);
    if (!pendingResult.ok) return pendingResult;
    const pending = pendingResult.value;

    const now = Date.now();
    // Active pending: return the existing code's expiry unchanged. Do NOT
    // regenerate the code or email a second one — this keeps the same code
    // valid and the same countdown across back/forward navigation.
    if (pending && pending.expiresAt.getTime() > now) {
      return ok({
        email: email.value,
        expiresAt: pending.expiresAt,
        expiresInSeconds: remainingSeconds(pending.expiresAt, now),
      });
    }

    const code = generateCode();
    const passwordHash = await this.hasher.hash(input.password);
    const codeHash = await this.hasher.hash(code);
    const expiresAt = new Date(now + CODE_TTL_MS);

    const upsertResult = await this.pendingRepo.upsert({
      email: email.value,
      passwordHash,
      displayName: input.displayName.trim(),
      codeHash,
      expiresAt,
    });
    if (!upsertResult.ok) return upsertResult;

    await sendVerificationEmail(this.emailSender, this.ts, email.value, code, input.locale);

    return ok({
      email: email.value,
      expiresAt,
      expiresInSeconds: Math.round(CODE_TTL_MS / 1000),
      code,
    });
  }
}

export function generateCode(): string {
  return String(crypto.randomInt(CODE_MIN, CODE_MAX + 1));
}

/** Whole seconds remaining until `expiresAt`, floored at 0. */
export function remainingSeconds(expiresAt: Date, nowMs: number): number {
  return Math.max(0, Math.round((expiresAt.getTime() - nowMs) / 1000));
}

export async function sendVerificationEmail(
  emailSender: IEmailSender,
  ts: TranslationService,
  to: string,
  code: string,
  locale: string,
): Promise<void> {
  const subject = ts.t('auth.verification_email_subject', locale);
  const intro = ts.t('auth.verification_email_intro', locale);
  const expiry = ts.t('auth.verification_email_expiry', locale);
  const html =
    `<p>${intro}</p>` +
    `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p>` +
    `<p>${expiry}</p>`;
  const text = `${intro}\n\n${code}\n\n${expiry}`;

  // Best-effort send — never let a transport failure surface to the caller.
  try {
    await emailSender.send({ to, subject, html, text });
  } catch {
    // intentionally swallowed
  }
}
