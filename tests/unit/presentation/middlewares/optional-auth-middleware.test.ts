import type { NextFunction, Request, Response } from 'express';
import { createOptionalAuthMiddleware } from '@presentation/middlewares/optional-auth-middleware';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import { ok, fail } from '@core/result/result';
import { UnauthorizedFailure } from '@core/failure';

// The optional-auth middleware guards the guest-public browse endpoints, so
// its security contract must stay locked down: it must NEVER reject a request
// (no 401 path), must leave `req.user` unset for anonymous or bad-token
// requests, and must only populate `req.user` from a token the signer
// actually verified.

function makeTokenSigner(verify: jest.Mock): ITokenSigner {
  return { sign: jest.fn(), verify } as unknown as ITokenSigner;
}

/** `isActive` decides whether the token's owner still exists. Defaults to a live account. */
function makeEnsureActive(isActive = true): EnsureAccountActiveUseCase {
  const repo = { isActive: jest.fn().mockResolvedValue(ok(isActive)) } as unknown as IAuthRepository;
  return new EnsureAccountActiveUseCase(repo);
}

function makeReq(authorization?: string): Request {
  return { headers: authorization !== undefined ? { authorization } : {} } as Request;
}

function makeRes(): { res: Response; status: jest.Mock } {
  const status = jest.fn().mockReturnValue({ json: jest.fn(), send: jest.fn() });
  return { res: { status } as unknown as Response, status };
}

describe('createOptionalAuthMiddleware', () => {
  it('continues anonymously (no req.user, no response) when the Authorization header is absent', async () => {
    const verify = jest.fn();
    const middleware = createOptionalAuthMiddleware(makeTokenSigner(verify), makeEnsureActive());
    const req = makeReq();
    const { res, status } = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(status).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('continues anonymously — never 401s — when the token is invalid or expired', async () => {
    const verify = jest.fn().mockResolvedValue(fail(new UnauthorizedFailure('expired')));
    const middleware = createOptionalAuthMiddleware(makeTokenSigner(verify), makeEnsureActive());
    const req = makeReq('Bearer bad-token');
    const { res, status } = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(status).not.toHaveBeenCalled();
  });

  it('populates req.user from the payload when a valid Bearer token is present', async () => {
    const verify = jest.fn().mockResolvedValue(ok({ sub: 'user-1', email: 'a@b.co' }));
    const middleware = createOptionalAuthMiddleware(makeTokenSigner(verify), makeEnsureActive());
    const req = makeReq('Bearer good-token');
    const { res, status } = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(verify).toHaveBeenCalledWith('good-token');
    expect(req.user).toEqual({ id: 'user-1', email: 'a@b.co' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('continues anonymously when the token belongs to a deleted account', async () => {
    const verify = jest.fn().mockResolvedValue(ok({ sub: 'deleted-user', email: 'a@b.co' }));
    const middleware = createOptionalAuthMiddleware(makeTokenSigner(verify), makeEnsureActive(false));
    const req = makeReq('Bearer still-valid-token');
    const { res, status } = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('treats a non-Bearer Authorization header as anonymous', async () => {
    const verify = jest.fn();
    const middleware = createOptionalAuthMiddleware(makeTokenSigner(verify), makeEnsureActive());
    const req = makeReq('Basic dXNlcjpwYXNz');
    const { res } = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });
});
