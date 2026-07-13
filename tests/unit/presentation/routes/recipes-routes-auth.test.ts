import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express, { type Express } from 'express';
import { recipesRoutes } from '@presentation/routes/recipes.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createOptionalAuthMiddleware } from '@presentation/middlewares/optional-auth-middleware';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import { ok } from '@core/result/result';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import type { RecipesController } from '@presentation/controllers/recipes.controller';
import type { FavoritesController } from '@presentation/controllers/favorites.controller';
import type { LikesController } from '@presentation/controllers/likes.controller';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { createTestTranslationService } from '../../../helpers/translation';

// Exercises the real `recipesRoutes` router (mounted the same way `app.ts`
// mounts it) with a real `authMiddleware`, over a real HTTP server, so the
// auth-vs-public split is verified at the routing layer rather than by
// reading the route table. Controllers/use cases are stubbed since only
// middleware ordering is under test here.

function makeTokenSigner(): ITokenSigner {
  return {
    sign: jest.fn(),
    verify: jest.fn(),
  } as unknown as ITokenSigner;
}

function makeControllers(): {
  controller: RecipesController;
  favoritesController: FavoritesController;
  likesController: LikesController;
  spies: {
    list: jest.Mock;
    create: jest.Mock;
    getById: jest.Mock;
    update: jest.Mock;
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
  const update = jest.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(200).json({ id: 'recipe-123' });
  });
  const remove = jest.fn(async (_req: unknown, res: { status: (n: number) => { send: () => void } }) => {
    res.status(204).send();
  });

  const controller = {
    list,
    create,
    getById,
    update,
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

  return { controller, favoritesController, likesController, spies: { list, create, getById, update, remove } };
}

function startServer(): { app: Express; server: Server; spies: ReturnType<typeof makeControllers>['spies'] } {
  const app = express();
  const { controller, favoritesController, likesController, spies } = makeControllers();
  const tokenSigner = makeTokenSigner();
  const liveAccount = new EnsureAccountActiveUseCase(
    { isActive: jest.fn().mockResolvedValue(ok(true)) } as unknown as IAuthRepository,
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
  // Mirrors app.ts: the auth middleware hands failures to `next`, so the error
  // handler has to be mounted for a rejected request to come back as a 401.
  app.use(createErrorHandler(createTestTranslationService()));

  const server = http.createServer(app);
  return { app, server, spies };
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
  let baseUrl: string;

  beforeAll(async () => {
    const started = startServer();
    server = started.server;
    spies = started.spies;
    baseUrl = await listen(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    spies.list.mockClear();
    spies.create.mockClear();
    spies.getById.mockClear();
    spies.update.mockClear();
    spies.remove.mockClear();
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

  it('returns 401 for PATCH /recipes/:id without an Authorization header', async () => {
    const res = await fetch(`${baseUrl}/recipes/recipe-123`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it('does not reach the controller for PATCH /recipes/:id without an Authorization header', async () => {
    await fetch(`${baseUrl}/recipes/recipe-123`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(spies.update).not.toHaveBeenCalled();
  });

  it('returns 401 for DELETE /recipes/:id without an Authorization header', async () => {
    const res = await fetch(`${baseUrl}/recipes/recipe-123`, { method: 'DELETE' });

    expect(res.status).toBe(401);
  });

  it('does not reach the controller for DELETE /recipes/:id without an Authorization header', async () => {
    await fetch(`${baseUrl}/recipes/recipe-123`, { method: 'DELETE' });

    expect(spies.remove).not.toHaveBeenCalled();
  });
});
