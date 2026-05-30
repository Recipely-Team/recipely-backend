import type { Request, Response } from 'express';
import { ok, fail, type Result } from '@core/result/result';
import { TooManyRequestsFailure, UnknownFailure } from '@core/failure';
import type { RequestRegistrationUseCase } from '@application/auth/use-cases/request-registration-use-case';
import type { VerifyRegistrationUseCase } from '@application/auth/use-cases/verify-registration-use-case';
import type {
  ResendRegistrationCodeUseCase,
  ResendRegistrationCodeResult,
} from '@application/auth/use-cases/resend-registration-code-use-case';
import type { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import type { SocialAuthUseCase } from '@application/auth/use-cases/social-auth-use-case';
import type { ForgotPasswordUseCase } from '@application/auth/use-cases/forgot-password-use-case';
import type { ResetPasswordUseCase } from '@application/auth/use-cases/reset-password-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import type { Failure } from '@core/failure';
import { AuthController } from '@presentation/controllers/auth.controller';

// ---- helpers ----------------------------------------------------------------

function makeTranslationService(): TranslationService {
  return {
    t: (key: string) => key,
    localeFromRequest: () => 'en',
  };
}

function makeResend(
  result: Result<ResendRegistrationCodeResult, Failure>,
): ResendRegistrationCodeUseCase {
  return {
    execute: jest
      .fn<Promise<Result<ResendRegistrationCodeResult, Failure>>, [unknown]>()
      .mockResolvedValue(result),
  } as unknown as ResendRegistrationCodeUseCase;
}

function makeController(resend: ResendRegistrationCodeUseCase, exposeDevCode = false): AuthController {
  return new AuthController(
    {} as RequestRegistrationUseCase,
    {} as VerifyRegistrationUseCase,
    resend,
    {} as LoginUseCase,
    {} as SocialAuthUseCase,
    makeTranslationService(),
    {} as ForgotPasswordUseCase,
    {} as ResetPasswordUseCase,
    'http://localhost:3000',
    exposeDevCode,
  );
}

function makeReq(email = 'user@example.com'): Request {
  return { body: { email }, params: {}, query: {}, locale: 'en' } as unknown as Request;
}

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

// ---- tests ------------------------------------------------------------------

describe('AuthController.handleResendRegistrationCode — failure surfacing', () => {
  it('responds with 429 when the use case returns a cooldown TooManyRequestsFailure', async () => {
    const resend = makeResend(fail(new TooManyRequestsFailure('errors.too_many_requests.code_cooldown')));
    const controller = makeController(resend);
    const { res, status } = makeRes();

    await controller.handleResendRegistrationCode(makeReq(), res);

    expect(status).toHaveBeenCalledWith(429);
  });

  it('emits the too_many_requests error code on cooldown', async () => {
    const resend = makeResend(fail(new TooManyRequestsFailure('errors.too_many_requests.code_cooldown')));
    const controller = makeController(resend);
    const { res, status } = makeRes();
    const statusReturn = { json: jest.fn() };
    status.mockReturnValue(statusReturn);

    await controller.handleResendRegistrationCode(makeReq(), res);

    expect(statusReturn.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'too_many_requests' }) }),
    );
  });

  it('responds with 500 when the use case returns an UnknownFailure (not a fake 200)', async () => {
    const resend = makeResend(fail(new UnknownFailure('errors.db.read_failed')));
    const controller = makeController(resend);
    const { res, status } = makeRes();

    await controller.handleResendRegistrationCode(makeReq(), res);

    expect(status).toHaveBeenCalledWith(500);
  });

  it('responds with a generic 200 when no pending registration exists', async () => {
    const resend = makeResend(ok({ found: false }));
    const controller = makeController(resend);
    const { res, status } = makeRes();

    await controller.handleResendRegistrationCode(makeReq(), res);

    expect(status).toHaveBeenCalledWith(200);
  });

  it('responds with 200 and expiresInSeconds when a pending registration was resent', async () => {
    const resend = makeResend(ok({ found: true, expiresInSeconds: 600, code: '123456' }));
    const controller = makeController(resend);
    const { res, status } = makeRes();
    const statusReturn = { json: jest.fn() };
    status.mockReturnValue(statusReturn);

    await controller.handleResendRegistrationCode(makeReq(), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(statusReturn.json).toHaveBeenCalledWith(
      expect.objectContaining({ expiresInSeconds: 600 }),
    );
  });

  it('does not leak devCode when exposeDevCode is false', async () => {
    const resend = makeResend(ok({ found: true, expiresInSeconds: 600, code: '123456' }));
    const controller = makeController(resend, false);
    const { res, status } = makeRes();
    const statusReturn = { json: jest.fn() };
    status.mockReturnValue(statusReturn);

    await controller.handleResendRegistrationCode(makeReq(), res);

    const payload = statusReturn.json.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(payload).not.toHaveProperty('devCode');
  });
});
