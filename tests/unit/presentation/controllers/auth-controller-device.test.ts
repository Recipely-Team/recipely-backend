import type { Request, Response } from 'express';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RequestRegistrationUseCase } from '@application/auth/use-cases/request-registration-use-case';
import type { VerifyRegistrationUseCase } from '@application/auth/use-cases/verify-registration-use-case';
import type { ResendRegistrationCodeUseCase } from '@application/auth/use-cases/resend-registration-code-use-case';
import type { LoginUseCase, LoginInput } from '@application/auth/use-cases/login-use-case';
import type { SocialAuthUseCase } from '@application/auth/use-cases/social-auth-use-case';
import type { ForgotPasswordUseCase } from '@application/auth/use-cases/forgot-password-use-case';
import type { ResetPasswordUseCase } from '@application/auth/use-cases/reset-password-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import type { AuthSessionDto } from '@application/auth/dtos/auth.dto';
import { AuthController } from '@presentation/controllers/auth.controller';

// `deviceContext()` is a private helper on AuthController — it is only
// exercised here through the public `handleLogin` entry point, by asserting
// on the input LoginUseCase.execute actually receives.

// ---- helpers ----------------------------------------------------------------

const SESSION: AuthSessionDto = {
  token: 'jwt-token',
  user: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Jane Cook',
    bio: null,
    photoUrl: null,
    role: 'user',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
};

function makeTranslationService(): TranslationService {
  return {
    t: (key: string) => key,
    localeFromRequest: () => 'en',
  };
}

function makeLogin(): { login: LoginUseCase; calls: () => LoginInput[] } {
  const calls: LoginInput[] = [];
  const login = {
    execute: jest.fn(async (input: LoginInput): Promise<Result<AuthSessionDto, Failure>> => {
      calls.push(input);
      return ok(SESSION);
    }),
  } as unknown as LoginUseCase;
  return { login, calls: () => calls };
}

function makeController(login: LoginUseCase, proxyDepth = 1): AuthController {
  return new AuthController(
    {} as RequestRegistrationUseCase,
    {} as VerifyRegistrationUseCase,
    {} as ResendRegistrationCodeUseCase,
    login,
    {} as SocialAuthUseCase,
    makeTranslationService(),
    {} as ForgotPasswordUseCase,
    {} as ResetPasswordUseCase,
    'http://localhost:3000',
    false,
    proxyDepth,
  );
}

function makeReq(overrides: {
  body?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
} = {}): Request {
  const headers: Record<string, string> = {};
  if (overrides.userAgent !== undefined) headers['user-agent'] = overrides.userAgent;
  return {
    body: { email: 'user@example.com', password: 'supersecret', ...overrides.body },
    params: {},
    query: {},
    headers,
    ip: overrides.ip ?? '5.6.7.8',
    locale: 'en',
  } as unknown as Request;
}

function makeRes(): { res: Response; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status };
}

// ---- tests --------------------------------------------------------------

describe('AuthController.handleLogin — device context', () => {
  it('builds the device context from the body, the client IP, and the user-agent header', async () => {
    const { login, calls } = makeLogin();
    const controller = makeController(login);
    const req = makeReq({
      body: { device: { deviceId: 'device-1', platform: 'ios', appVersion: '1.2.3' } },
      ip: '9.9.9.9',
      userAgent: 'RecipelyApp/1.0',
    });
    const { res } = makeRes();

    await controller.handleLogin(req, res);

    expect(calls()[0]?.device).toEqual({
      deviceId: 'device-1',
      platform: 'ios',
      appVersion: '1.2.3',
      ip: '9.9.9.9',
      userAgent: 'RecipelyApp/1.0',
    });
  });

  it('omits the device field entirely when the body has no device', async () => {
    const { login, calls } = makeLogin();
    const controller = makeController(login);
    const req = makeReq();
    const { res } = makeRes();

    await controller.handleLogin(req, res);

    expect(calls()[0]).not.toHaveProperty('device');
  });

  it('omits userAgent from the device context when the header is missing', async () => {
    const { login, calls } = makeLogin();
    const controller = makeController(login);
    const req = makeReq({ body: { device: { deviceId: 'device-1', platform: 'android' } } });
    const { res } = makeRes();

    await controller.handleLogin(req, res);

    expect(calls()[0]?.device).not.toHaveProperty('userAgent');
  });
});
