import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express from 'express';
import { assistantRoutes } from '@presentation/routes/assistant.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import { fail, ok } from '@core/result/result';
import { UnauthorizedFailure } from '@core/failure';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { AssistantController } from '@presentation/controllers/assistant.controller';

/**
 * Nothing about the assistant is public.
 *
 * A minted Live token is a bearer credential to Google that spends this
 * project's quota, and the typed turn spends the AI budget — so an assistant
 * route reachable without a session is both an unmetered bill and an
 * unattributable one, since the daily budget is counted per user id. The
 * routes are guarded today; this is the test that says so out loud, at the
 * routing layer, rather than leaving it to be re-read off the router each
 * time someone adds an endpoint to it.
 */

function makeController(): {
  controller: AssistantController;
  spies: { session: jest.Mock; heartbeat: jest.Mock; message: jest.Mock };
} {
  const reply = (): jest.Mock =>
    jest.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
      res.status(200).json({});
    });
  const spies = { session: reply(), heartbeat: reply(), message: reply() };

  return { controller: spies as unknown as AssistantController, spies };
}

function startServer(): {
  server: Server;
  spies: ReturnType<typeof makeController>['spies'];
  tokenSigner: TokenSignerInterface;
} {
  const app = express();
  const { controller, spies } = makeController();
  const tokenSigner = { sign: jest.fn(), verify: jest.fn() } as unknown as TokenSignerInterface;
  const liveAccount = new EnsureAccountActiveUseCase({
    getAccountStatus: jest.fn().mockResolvedValue(ok({ deletedAt: null, suspendedAt: null })),
  } as unknown as AuthRepositoryInterface);
  // Mounted exactly as `app.ts` mounts it, so what is under test is the router
  // production runs and not a re-description of it.
  const aiRateLimit = (_req: unknown, _res: unknown, next: () => void): void => next();
  app.use(
    '/assistant',
    assistantRoutes(controller, createAuthMiddleware(tokenSigner, liveAccount), aiRateLimit as never),
  );

  return { server: http.createServer(app), spies, tokenSigner };
}

const ROUTES = ['/assistant/session', '/assistant/heartbeat', '/assistant/message'] as const;

describe('assistantRoutes — every route needs a session', () => {
  let server: Server;
  let spies: ReturnType<typeof makeController>['spies'];
  let tokenSigner: TokenSignerInterface;
  let baseUrl: string;

  beforeAll(async () => {
    const started = startServer();
    server = started.server;
    spies = started.spies;
    tokenSigner = started.tokenSigner;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    spies.session.mockClear();
    spies.heartbeat.mockClear();
    spies.message.mockClear();
    (tokenSigner.verify as jest.Mock).mockReset();
  });

  const post = (route: string, token?: string): Promise<Response> =>
    fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({}),
    });

  it.each(ROUTES)('answers 401 for %s without an Authorization header', async (route) => {
    const res = await post(route);

    expect(res.status).toBe(401);
  });

  it.each(ROUTES)('does not reach the controller for %s without one', async (route) => {
    await post(route);

    expect(spies.session).not.toHaveBeenCalled();
    expect(spies.heartbeat).not.toHaveBeenCalled();
    expect(spies.message).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('answers 401 for %s with a token that does not verify', async (route) => {
    // The signer answers with a Result, never an exception (CLAUDE.md §12).
    (tokenSigner.verify as jest.Mock).mockResolvedValue(
      fail(new UnauthorizedFailure('Invalid token')),
    );

    const res = await post(route, 'not-a-real-token');

    expect(res.status).toBe(401);
  });

  // The other half of the guard: it must not be refusing everyone.
  it('reaches the controller once a session verifies', async () => {
    (tokenSigner.verify as jest.Mock).mockResolvedValue(
      ok({ sub: 'user-1', email: 'cook@example.com' }),
    );

    const res = await post('/assistant/session', 'a-valid-token');

    expect(res.status).toBe(200);
    expect(spies.session).toHaveBeenCalledTimes(1);
  });
});
