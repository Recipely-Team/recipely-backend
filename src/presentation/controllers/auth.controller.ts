import type { Request, Response } from 'express';
import type { RegisterUseCase } from '@application/auth/use-cases/register-use-case';
import type { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import type { SocialAuthUseCase } from '@application/auth/use-cases/social-auth-use-case';
import type { ForgotPasswordUseCase } from '@application/auth/use-cases/forgot-password-use-case';
import type { ResetPasswordUseCase } from '@application/auth/use-cases/reset-password-use-case';
import {
  LoginBodySchema,
  RegisterBodySchema,
  SocialAuthBodySchema,
  ForgotPasswordBodySchema,
  ResetPasswordBodySchema,
} from '@presentation/validators/auth.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import type { TranslationService } from '@application/i18n/translation-service';

export class AuthController {
  constructor(
    private readonly register: RegisterUseCase,
    private readonly login: LoginUseCase,
    private readonly socialAuth: SocialAuthUseCase,
    private readonly ts: TranslationService,
    private readonly forgotPassword: ForgotPasswordUseCase,
    private readonly resetPassword: ResetPasswordUseCase,
    private readonly appBaseUrl: string,
  ) {}

  handleRegister = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const body = RegisterBodySchema.parse(req.body);
    const result = await this.register.execute(body);
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