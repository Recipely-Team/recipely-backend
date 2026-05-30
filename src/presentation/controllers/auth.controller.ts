import type { Request, Response } from 'express';
import type { RequestRegistrationUseCase } from '@application/auth/use-cases/request-registration-use-case';
import type { VerifyRegistrationUseCase } from '@application/auth/use-cases/verify-registration-use-case';
import type { ResendRegistrationCodeUseCase } from '@application/auth/use-cases/resend-registration-code-use-case';
import type { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import type { SocialAuthUseCase } from '@application/auth/use-cases/social-auth-use-case';
import type { ForgotPasswordUseCase } from '@application/auth/use-cases/forgot-password-use-case';
import type { ResetPasswordUseCase } from '@application/auth/use-cases/reset-password-use-case';
import {
  LoginBodySchema,
  RegisterBodySchema,
  VerifyRegistrationBodySchema,
  ResendRegistrationBodySchema,
  SocialAuthBodySchema,
  ForgotPasswordBodySchema,
  ResetPasswordBodySchema,
} from '@presentation/validators/auth.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import type { TranslationService } from '@application/i18n/translation-service';

export class AuthController {
  constructor(
    private readonly requestRegistration: RequestRegistrationUseCase,
    private readonly verifyRegistration: VerifyRegistrationUseCase,
    private readonly resendRegistrationCode: ResendRegistrationCodeUseCase,
    private readonly login: LoginUseCase,
    private readonly socialAuth: SocialAuthUseCase,
    private readonly ts: TranslationService,
    private readonly forgotPassword: ForgotPasswordUseCase,
    private readonly resetPassword: ResetPasswordUseCase,
    private readonly appBaseUrl: string,
    private readonly exposeDevCode: boolean,
  ) {}

  handleRegister = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const body = RegisterBodySchema.parse(req.body);
    const result = await this.requestRegistration.execute({ ...body, locale });
    if (!result.ok) {
      const { status, body: err } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(err);
      return;
    }
    const { email, expiresInSeconds, code } = result.value;
    res.status(200).json({
      message: this.ts.t('auth.register_code_sent', locale),
      email,
      expiresInSeconds,
      ...(this.exposeDevCode ? { devCode: code } : {}),
    });
  };

  handleVerifyRegistration = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const body = VerifyRegistrationBodySchema.parse(req.body);
    const result = await this.verifyRegistration.execute(body);
    if (!result.ok) {
      const { status, body: err } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(err);
      return;
    }
    res.status(201).json(result.value);
  };

  handleResendRegistrationCode = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { email } = ResendRegistrationBodySchema.parse(req.body);
    const result = await this.resendRegistrationCode.execute({ email, locale });
    // Surface real failures (e.g. the 30s cooldown -> 429, infra errors -> 500)
    // instead of masking them as a success. The generic-200 enumeration guard
    // below still applies to the found/not-found *success* split.
    if (!result.ok) {
      const { status, body: err } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(err);
      return;
    }
    // Always return a generic 200 to avoid leaking which emails have a pending
    // registration. Extra fields only when a pending row actually existed.
    const extra = result.value.found
      ? {
          expiresInSeconds: result.value.expiresInSeconds,
          ...(this.exposeDevCode ? { devCode: result.value.code } : {}),
        }
      : {};
    res.status(200).json({
      message: this.ts.t('auth.register_code_resent', locale),
      ...extra,
    });
  };

  handleLogin = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const body = LoginBodySchema.parse(req.body);
    const result = await this.login.execute(body);
    if (!result.ok) {
      const { status, body: err } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(err);
      return;
    }
    res.status(200).json(result.value);
  };

  handleSocialAuth = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { idToken } = SocialAuthBodySchema.parse(req.body);
    const result = await this.socialAuth.execute({ idToken });
    if (!result.ok) {
      const { status, body: err } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(err);
      return;
    }
    res.status(200).json(result.value);
  };

  handleForgotPassword = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { email } = ForgotPasswordBodySchema.parse(req.body);
    await this.forgotPassword.execute({ email, appBaseUrl: this.appBaseUrl });
    // Always return 200 to prevent email enumeration
    res.status(200).json({ message: this.ts.t('auth.forgot_password_sent', locale) });
  };

  handleResetPassword = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { token, newPassword } = ResetPasswordBodySchema.parse(req.body);
    const result = await this.resetPassword.execute({ token, newPassword });
    if (!result.ok) {
      const { status, body: err } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(err);
      return;
    }
    res.status(200).json({ message: this.ts.t('auth.password_reset_success', locale) });
  };
}