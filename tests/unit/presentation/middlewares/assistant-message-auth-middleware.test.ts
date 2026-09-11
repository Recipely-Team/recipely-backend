import type { NextFunction, Request, Response } from 'express';
import { createAssistantMessageAuthMiddleware } from '@presentation/middlewares/assistant-message-auth-middleware';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { IntentTokenSignerInterface } from '@application/assistant/ports/intent-token-signer-interface';
import { fail, ok } from '@core/result/result';
import { UnauthorizedFailure } from '@core/failure';
import { AssistantCaller } from '@domain/assistant/assistant-caller';

const USER = { sub: 'user-1', email: 'cook@example.com' };

function deps(options: { session?: boolean; intent?: boolean; deletedAt?: Date | null } = {}) {
  const sessions = {
    sign: jest.fn(),
    verify: jest.fn().mockResolvedValue(
      options.session === true ? ok(USER) : fail(new UnauthorizedFailure('Not a session token')),
    ),
  } as unknown as TokenSignerInterface;
  const intents = {
    sign: jest.fn(),
    lifetimeSeconds: 60,
    verify: jest.fn().mockResolvedValue(
      options.intent === true ? ok(USER) : fail(new UnauthorizedFailure('Not an assistant intent token')),
    ),
  } as unknown as IntentTokenSignerInterface;
  const ensureActive = new EnsureAccountActiveUseCase({
    getAccountStatus: jest
      .fn()
      .mockResolvedValue(ok({ deletedAt: options.deletedAt ?? null, suspendedAt: null })),
  } as unknown as AuthRepositoryInterface);

  return { sessions, intents, ensureActive };
}

function call(middleware: ReturnType<typeof createAssistantMessageAuthMiddleware>, token?: string) {
  const req = {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  } as unknown as Request;
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;

  return { promise: middleware(req, res, next), req, res, next, json };
}

describe('createAssistantMessageAuthMiddleware', () => {
  it('admits a session and does not bother the intent signer', async () => {
    const { sessions, intents, ensureActive } = deps({ session: true });
    const { promise, next, req } = call(createAssistantMessageAuthMiddleware(sessions, intents, ensureActive), 'x');

    await promise;

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: USER.sub, email: USER.email });
    expect(req.assistantCaller).toBe(AssistantCaller.App);
    expect(intents.verify).not.toHaveBeenCalled();
  });

  // The token that passed is what names the caller, and the caller decides how
  // long the answer may take — the phone's assistant gives up after 15 seconds.
  it('admits an intent token when the session refuses it, as the phone assistant', async () => {
    const { sessions, intents, ensureActive } = deps({ intent: true });
    const { promise, next, req } = call(createAssistantMessageAuthMiddleware(sessions, intents, ensureActive), 'x');

    await promise;

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: USER.sub, email: USER.email });
    expect(req.assistantCaller).toBe(AssistantCaller.PhoneAssistant);
  });

  // The reason the tombstone check is in this middleware and not only in the
  // session one: both tokens are stateless, deletion tombstones the row rather
  // than dropping it, and the intent token outlives a session by weeks. Without
  // this, a deleted account's Siri shortcut would keep answering until the token
  // expired — using an account that no longer exists.
  it('refuses an intent token for an account that has been deleted', async () => {
    const { sessions, intents, ensureActive } = deps({ intent: true, deletedAt: new Date() });
    const { promise, next, res } = call(createAssistantMessageAuthMiddleware(sessions, intents, ensureActive), 'x');

    await promise;

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('refuses a request with no bearer token at all', async () => {
    const { sessions, intents, ensureActive } = deps();
    const { promise, next, res } = call(createAssistantMessageAuthMiddleware(sessions, intents, ensureActive));

    await promise;

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(sessions.verify).not.toHaveBeenCalled();
  });

  // Reported failure is the session's: nearly every bad credential here is an
  // app with an expired session, and "not an assistant intent token" would send
  // whoever reads the log at the wrong half of the system.
  it('reports the session failure when both refuse', async () => {
    const { sessions, intents, ensureActive } = deps();
    const { promise, json } = call(createAssistantMessageAuthMiddleware(sessions, intents, ensureActive), 'x');

    await promise;

    expect(JSON.stringify(json.mock.calls[0])).toContain('Not a session token');
  });
});
