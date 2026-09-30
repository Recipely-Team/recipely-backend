import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express, { type Express } from 'express';
import { recipesRoutes } from '@presentation/routes/recipes.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createOptionalAuthMiddleware } from '@presentation/middlewares/optional-auth-middleware';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import { ok } from '@core/result/result';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { RecipesController } from '@presentation/controllers/recipes.controller';
import type { FavoritesController } from '@presentation/controllers/favorites.controller';
import type { LikesController } from '@presentation/controllers/likes.controller';

// Exercises the real `recipesRoutes` router (mounted the same way `app.ts`
// mounts it) with a real `authMiddleware`, over a real HTTP server, so the
// auth-vs-public split is verified at the routing layer rather than by
// reading the route table. Controllers/use cases are stubbed since only
// middleware ordering is under test here.

function makeTokenSigner(): TokenSignerInterface {
  return {
    sign: jest.fn(),
    verify: jest.fn(),
  } as unknown as TokenSignerInterface;
}

function makeControllers(): {
  controller: RecipesController;
  favoritesController: FavoritesController;
  likesController: LikesController;
  spies: {
    list: jest.Mock;
    create: jest.Mock;
    getById: jest.Mock;
    remove: jest.Mock;
  };
} {
  const list = jest.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(200).json({ items: [] });
  });
  const create = jest.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(201).json({ id: 'created' });
  });
  const getById = jest.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(200).json({ id: 'recipe-123' });
  });
  const remove = jest.fn(async (_req: unknown, res: { status: (n: number) => { send: () => void } }) => {
    res.status(204).send();
  });

  const controller = {
    list,
    create,
    getById,
    remove,
    getCategories: jest.fn(),
    getCuisines: jest.fn(),
    trending: jest.fn(),
    createWithImage: jest.fn(),
    generate: jest.fn(),
    importFromInstagram: jest.fn(),
    backfillNutrition: jest.fn(),
    incrementView: jest.fn(),
    calculateNutrition: jest.fn(),
  } as unknown as RecipesController;

  const favoritesController = {
    add: jest.fn(),
    remove: jest.fn(),
  } as unknown as FavoritesController;

  const likesController = {
    like: jest.fn(),
    unlike: jest.fn(),
  } as unknown as LikesController;

  return { controller, favoritesController, likesController, spies: { list, create, getById, remove } };
}

function startServer(): {
  app: Express;
  server: Server;
  spies: ReturnType<typeof makeControllers>['spies'];
  tokenSigner: TokenSignerInterface;
} {
  const app = express();
  const { controller, favoritesController, likesController, spies } = makeControllers();
  const tokenSigner = makeTokenSigner();
  const liveAccount = new EnsureAccountActiveUseCase(
    { getAccountStatus: jest.fn().mockResolvedValue(ok({ deletedAt: null, suspendedAt: null, role: 'user' })) } as unknown as AuthRepositoryInterface,
  );
  const authMiddleware = createAuthMiddleware(tokenSigner, liveAccount);
  const optionalAuthMiddleware = createOptionalAuthMiddleware(tokenSigner, liveAccount);
  const aiRateLimit = (_req: unknown, _res: unknown, next: () => void): void => next();

  app.use(
    '/recipes',
    recipesRoutes(
      controller,
      favoritesController,
      authMiddleware,
      likesController,
      aiRateLimit as never,
      optionalAuthMiddleware,
    ),
  );

  const server = http.createServer(app);
  return { app, server, spies, tokenSigner };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('recipesRoutes — public GET /:id vs authenticated routes', () => {
  // `recipesRoutes` registers its routes on a module-level `Router()`
  // singleton rather than creating a fresh one per call (see hand-off notes),
  // so calling it more than once per process accumulates duplicate route
  // layers. Production only ever calls it once (in app.ts), so the server
  // is built once here too, mirroring that usage; mock call counts are
  // cleared between tests instead of rebuilding the router.
  let server: Server;
  let spies: ReturnType<typeof makeControllers>['spies'];
  let tokenSigner: TokenSignerInterface;
  let baseUrl: string;

  beforeAll(async () => {
    const started = startServer();
    server = started.server;
    spies = started.spies;
    tokenSigner = started.tokenSigner;
    baseUrl = await listen(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    spies.list.mockClear();
    spies.create.mockClear();
    spies.getById.mockClear();
    spies.remove.mockClear();
    (tokenSigner.verify as jest.Mock).mockReset();
  });

  it('returns 200 for GET /recipes/:id without an Authorization header', async () => {
    const res = await fetch(`${baseUrl}/recipes/recipe-123`);

    expect(res.status).toBe(200);
  });

  it('reaches the controller for GET /recipes/:id without an Authorization header', async () => {
    await fetch(`${baseUrl}/recipes/recipe-123`);

    expect(spies.getById).toHaveBeenCalledTimes(1);
  });

  it('returns 200 for GET /recipes (list) without an Authorization header — guests can browse', async () => {
    const res = await fetch(`${baseUrl}/recipes`);

    expect(res.status).toBe(200);
  });

  it('reaches the controller for GET /recipes (list) without an Authorization header', async () => {
    await fetch(`${baseUrl}/recipes`);

    expect(spies.list).toHaveBeenCalledTimes(1);
  });

  it('returns 401 for POST /recipes (create) without an Authorization header', async () => {
    const res = await fetch(`${baseUrl}/recipes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it('does not reach the controller for POST /recipes (create) without an Authorization header', async () => {
    await fetch(`${baseUrl}/recipes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(spies.create).not.toHaveBeenCalled();
  });

  /**
   * Recipe editing was removed from the product: there is no PATCH handler
   * left to authenticate. The route must be gone rather than merely guarded —
   * a 401 here would mean the endpoint still exists behind auth.
   */
  it('no longer routes PATCH /recipes/:id at all', async () => {
    const res = await fetch(`${baseUrl}/recipes/recipe-123`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
  });

  it('returns 401 for DELETE /recipes/:id without an Authorization header', async () => {
    const res = await fetch(`${baseUrl}/recipes/recipe-123`, { method: 'DELETE' });

    expect(res.status).toBe(401);
  });

  it('does not reach the controller for DELETE /recipes/:id without an Authorization header', async () => {
    await fetch(`${baseUrl}/recipes/recipe-123`, { method: 'DELETE' });

    expect(spies.remove).not.toHaveBeenCalled();
  });

  /**
   * GET /:id needs OPTIONAL auth, not NO auth — the distinction these tests
   * exist to hold.
   *
   * The route was registered bare so guests could open shared links. That also
   * meant a signed-in caller's token was never decoded, so `req.user` stayed
   * undefined, `getById` called the use case without a `currentUserId`, and the
   * repository skipped its `likes: { where: { userId } }` join and answered
   * `likedByMe: false` for everybody. Symptom in the app: like a recipe, reopen
   * it, and the heart is empty again — and because the detail screen syncs that
   * answer into its likes store, the empty heart propagated back to the list.
   *
   * `user` is read off the recorded request rather than asserted through a
   * response body: the controller is stubbed here, so the request object is the
   * only place the middleware's effect is observable.
   */
  describe('GET /:id — optional auth populates req.user', () => {
    const userFromLastGetById = (): unknown =>
      (spies.getById.mock.calls[0]?.[0] as { user?: unknown } | undefined)?.user;

    it('decodes a valid Bearer token so the controller can pass currentUserId', async () => {
      (tokenSigner.verify as jest.Mock).mockResolvedValue(
        ok({ sub: 'user-1', email: 'liker@example.com' }),
      );

      await fetch(`${baseUrl}/recipes/recipe-123`, {
        headers: { authorization: 'Bearer valid-token' },
      });

      // The regression: with no middleware on the route this was `undefined`
      // even though the client sent a perfectly good token.
      expect(userFromLastGetById()).toEqual({ id: 'user-1', email: 'liker@example.com' });
    });

    it('still serves a guest with no Authorization header, as an anonymous request', async () => {
      const res = await fetch(`${baseUrl}/recipes/recipe-123`);

      expect(res.status).toBe(200);
      expect(userFromLastGetById()).toBeUndefined();
    });

    it('never answers 401 when the token is invalid — the shared link must still open', async () => {
      (tokenSigner.verify as jest.Mock).mockResolvedValue({ ok: false, failure: 'expired' });

      const res = await fetch(`${baseUrl}/recipes/recipe-123`, {
        headers: { authorization: 'Bearer garbage' },
      });

      expect(res.status).toBe(200);
      expect(spies.getById).toHaveBeenCalledTimes(1);
      // Falls through as a guest rather than as its former bearer.
      expect(userFromLastGetById()).toBeUndefined();
    });
  });
});
