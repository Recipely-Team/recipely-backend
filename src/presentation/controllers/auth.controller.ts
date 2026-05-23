import type { Request, Response } from 'express';
import type { RegisterUseCase } from '@application/auth/use-cases/register-use-case';
import type { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import type { SocialAuthUseCase } from '@application/auth/use-cases/social-auth-use-case';
import {
  LoginBodySchema,
  RegisterBodySchema,
  SocialAuthBodySchema,
} from '@presentation/validators/auth.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import type { TranslationService } from '@application/i18n/translation-service';

export class AuthController {
  constructor(
    private readonly register: RegisterUseCase,
    private readonly login: LoginUseCase,
    private readonly socialAuth: SocialAuthUseCase,
    private readonly ts: TranslationService,
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
}