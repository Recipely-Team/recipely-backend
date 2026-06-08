import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IPasswordResetTokenRepository } from '@domain/auth/i-password-reset-token-repository';
import type { IEmailSender } from '@application/auth/ports/i-email-sender';
import type { TranslationService } from '@application/i18n/translation-service';
import crypto from 'crypto';

export interface ForgotPasswordInput {
  readonly email: string;
  readonly appBaseUrl: string;
  readonly locale: string;
}

export class ForgotPasswordUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly emailSender: IEmailSender,
    private readonly ts: TranslationService,
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
    const locale = input.locale;

    const subject = this.ts.t('auth.reset_email_subject', locale);
    const intro = this.ts.t('auth.reset_email_intro', locale);
    const buttonLabel = this.ts.t('auth.reset_email_button', locale);
    const expiry = this.ts.t('auth.reset_email_expiry', locale);

    // Escape the localized strings before embedding them in HTML — they are
    // editable translation content, not trusted markup. The token/URL is hex +
    // operator-controlled so it needs no escaping. The plain-text part uses the
    // raw (unescaped) strings.
    const html =
      `<p>${escapeHtml(intro)}</p>` +
      `<p style="margin:24px 0">` +
      `<a href="${resetUrl}" style="background:#e85d04;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:700;display:inline-block">${escapeHtml(buttonLabel)}</a>` +
      `</p>` +
      `<p>${escapeHtml(expiry)}</p>`;
    const text = `${intro}\n\n${resetUrl}\n\n${expiry}`;

    // Best-effort email send
    try {
      await this.emailSender.send({ to: input.email, subject, html, text });
    } catch {
      // intentionally swallowed — don't leak error info
    }

    return ok(undefined);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
