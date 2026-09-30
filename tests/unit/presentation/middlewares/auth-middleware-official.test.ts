import type { NextFunction, Request, Response } from 'express';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createOptionalAuthMiddleware } from '@presentation/middlewares/optional-auth-middleware';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import { ok } from '@core/result/result';

// A token for the official "Recipely Mutfağı" account must not open a single
// authenticated request, on the strict middleware or the guest-optional one.

const tokens = {
  sign: jest.fn(),
  verify: jest.fn().mockResolvedValue(ok({ sub: 'official-1', email: 'mutfak@recipely.net' })),
} as unknown as TokenSignerInterface;

const ensureActive = (role: string) =>
  new EnsureAccountActiveUseCase({
    getAccountStatus: jest.fn().mockResolvedValue(ok({ deletedAt: null, suspendedAt: null, role })),
  } as unknown as AuthRepositoryInterface);

const req = () => ({ headers: { authorization: 'Bearer t' } }) as Request;
const res = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
};

describe('auth middlewares — the official account', () => {
  it('the strict middleware answers 401 account_cannot_sign_in and never calls next', async () => {
    const r = req();
    const { res: response, status, json } = res();
    const next = jest.fn() as NextFunction;

    await createAuthMiddleware(tokens, ensureActive('official'))(r, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(JSON.stringify(json.mock.calls[0]?.[0])).toContain('account_cannot_sign_in');
    expect(r.user).toBeUndefined();
  });

  it('the optional middleware treats it as a guest', async () => {
    const r = req();
    const next = jest.fn() as NextFunction;

    await createOptionalAuthMiddleware(tokens, ensureActive('official'))(r, res().res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(r.user).toBeUndefined();
  });

  it('an ordinary user still gets through', async () => {
    const r = req();
    const next = jest.fn() as NextFunction;

    await createAuthMiddleware(tokens, ensureActive('user'))(r, res().res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(r.user).toEqual({ id: 'official-1', email: 'mutfak@recipely.net' });
  });
});
