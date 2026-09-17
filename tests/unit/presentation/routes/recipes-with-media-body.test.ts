/**
 * The symptom: a recipe published with photos left its draft sitting in the
 * drafts list, as if it had never been published.
 *
 * `/recipes/with-media` does not ADD to the request body, it REBUILDS it — and
 * `fromDraftId`, the field the server retires the draft by, was not among the
 * keys it copied across. The app sends it; `controller.create` never saw it.
 * Nothing failed: the recipe was created and the draft simply stayed, which is
 * why the only symptom was a list that kept growing.
 *
 * Its own file, not an extra `describe` in `recipes-routes-auth.test.ts`:
 * `recipesRoutes` registers on a module-level `Router()` singleton, so building
 * a second server in the same process stacks duplicate route layers and the run
 * hangs. A separate file is a separate module registry.
 */

import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express from 'express';
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

// The route calls `loadEnv()` per request to build the public media base URL.
// A test process has none of the deployment's variables, and the real loader
// throws on a missing one — which arrives as a bare 500 from express, not as a
// message naming the cause.
jest.mock('@infrastructure/config/env', () => ({
  loadEnv: () => ({ BASE_URL: 'https://api.example.com', PORT: 3000 }),
}));

const DRAFT_ID = '3f0b0f0e-0000-4000-8000-000000000000';

/**
 * Snapshotted INSIDE the call, never read off `req` afterwards: the route
 * restores the original multipart body the moment the controller returns
 * (`req.body = originalBody`), so a later read sees the raw form fields and an
 * assertion against it passes for the wrong reason.
 */
let bodySeenByController: Record<string, unknown> = {};

const create = jest.fn(
  async (
    req: { body: Record<string, unknown> },
    res: { status: (n: number) => { json: (b: unknown) => void } },
  ) => {
    bodySeenByController = { ...req.body };
    res.status(201).json({ id: 'created' });
  },
);

const tokenSigner = { sign: jest.fn(), verify: jest.fn() } as unknown as TokenSignerInterface;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  const liveAccount = new EnsureAccountActiveUseCase({
    getAccountStatus: jest.fn().mockResolvedValue(ok({ deletedAt: null, suspendedAt: null })),
  } as unknown as AuthRepositoryInterface);
  app.use(
    '/recipes',
    recipesRoutes(
      { create, getCategories: jest.fn(), getCuisines: jest.fn(), trending: jest.fn(), list: jest.fn(), getById: jest.fn(), remove: jest.fn(), createWithImage: jest.fn(), generate: jest.fn(), importFromInstagram: jest.fn(), backfillNutrition: jest.fn(), incrementView: jest.fn(), calculateNutrition: jest.fn() } as unknown as RecipesController,
      { add: jest.fn(), remove: jest.fn() } as unknown as FavoritesController,
      createAuthMiddleware(tokenSigner, liveAccount),
      { like: jest.fn(), unlike: jest.fn() } as unknown as LikesController,
      ((_req: unknown, _res: unknown, next: () => void): void => next()) as never,
      createOptionalAuthMiddleware(tokenSigner, liveAccount),
    ),
  );
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const publish = async (extra: Record<string, string>): Promise<void> => {
  (tokenSigner.verify as jest.Mock).mockResolvedValue(ok({ sub: 'user-1', email: 'cook@example.com' }));
  create.mockClear();
  bodySeenByController = {};
  const form = new FormData();
  form.append('name', JSON.stringify({ tr: 'Fırında Sütlaç' }));
  form.append('cuisine', 'TURKISH');
  form.append('category', 'DESSERT');
  form.append('difficulty', 'EASY');
  form.append('ingredients', JSON.stringify({ tr: ['1 litre süt'] }));
  form.append('instructions', JSON.stringify({ tr: ['Pişir.'] }));
  form.append('prepTimeMinutes', '15');
  form.append('cookTimeMinutes', '60');
  form.append('servings', '4');
  for (const [key, value] of Object.entries(extra)) form.append(key, value);

  const res = await fetch(`${baseUrl}/recipes/with-media`, {
    method: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    body: form,
  });
  expect(res.status).toBe(201);
};

const bodyOfLastCreate = (): Record<string, unknown> => bodySeenByController;

describe('POST /recipes/with-media — the body it hands the controller', () => {
  it('carries fromDraftId through, so the draft it came from can be retired', async () => {
    await publish({ fromDraftId: DRAFT_ID });

    expect(bodyOfLastCreate().fromDraftId).toBe(DRAFT_ID);
  });

  it('omits fromDraftId when the recipe came from no draft at all', async () => {
    await publish({});

    expect(bodyOfLastCreate()).not.toHaveProperty('fromDraftId');
  });

  it('still assembles the fields it always did', async () => {
    await publish({});

    expect(bodyOfLastCreate()).toMatchObject({
      name: { tr: 'Fırında Sütlaç' },
      cuisine: 'TURKISH',
      prepTimeMinutes: 15,
      servings: 4,
    });
  });
});
