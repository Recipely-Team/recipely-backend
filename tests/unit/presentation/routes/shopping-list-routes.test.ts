import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express, { type RequestHandler } from 'express';
import { ok } from '@core/result/result';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { TranslationService } from '@application/i18n/translation-service';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import { AddShoppingItemsUseCase } from '@application/shopping/use-cases/add-shopping-items-use-case';
import { ListShoppingItemsUseCase } from '@application/shopping/use-cases/list-shopping-items-use-case';
import { GetShoppingSummaryUseCase } from '@application/shopping/use-cases/get-shopping-summary-use-case';
import { UpdateShoppingItemUseCase } from '@application/shopping/use-cases/update-shopping-item-use-case';
import { DeleteShoppingItemUseCase } from '@application/shopping/use-cases/delete-shopping-item-use-case';
import { ClearShoppingListUseCase } from '@application/shopping/use-cases/clear-shopping-list-use-case';
import { ShoppingListController } from '@presentation/controllers/shopping/shopping-list.controller';
import { shoppingListRoutes } from '@presentation/routes/shopping-list.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { createRateLimitMiddleware } from '@presentation/middlewares/rate-limit-middleware';
import { InMemoryShoppingListRepository } from '../../fixtures/in-memory-shopping-list-repository';

/**
 * Mounted the way `app.ts` mounts it, over the real controller, use cases,
 * validators and error handler: every route needs a session, ids are scoped to
 * their owner, and `/items/checked` is not swallowed by `/items/:id`.
 */

const BASE = '/me/shopping-list';
const ID = '00000000-0000-4000-8000-000000000000';

function startServer(writeRateLimit: RequestHandler): { server: Server; tokens: TokenSignerInterface } {
  const repo = new InMemoryShoppingListRepository();
  const moderator = { moderate: () => ({ status: ModerationStatus.Approved }) } as const;
  const ts = { t: (key: string) => key } as unknown as TranslationService;
  const tokens = { sign: jest.fn(), verify: jest.fn() } as unknown as TokenSignerInterface;
  const liveAccount = new EnsureAccountActiveUseCase({
    getAccountStatus: jest.fn().mockResolvedValue(ok({ deletedAt: null, suspendedAt: null, role: 'user' })),
  } as unknown as AuthRepositoryInterface);
  const controller = new ShoppingListController(
    {
      list: new ListShoppingItemsUseCase(repo),
      summary: new GetShoppingSummaryUseCase(repo),
      add: new AddShoppingItemsUseCase(repo, moderator),
      update: new UpdateShoppingItemUseCase(repo, moderator),
      remove: new DeleteShoppingItemUseCase(repo),
      clear: new ClearShoppingListUseCase(repo),
    },
    ts,
  );
  const app = express();
  app.use(express.json());
  app.use(BASE, shoppingListRoutes(controller, createAuthMiddleware(tokens, liveAccount), writeRateLimit));
  app.use(createErrorHandler(ts));
  return { server: http.createServer(app), tokens };
}

async function listen(writeRateLimit: RequestHandler) {
  const { server, tokens } = startServer(writeRateLimit);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (method: string, route: string, user?: string, body?: unknown): Promise<Response> => {
    if (user !== undefined) (tokens.verify as jest.Mock).mockResolvedValueOnce(ok({ sub: user, email: `${user}@x.test` }));
    return fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...(user === undefined ? {} : { authorization: 'Bearer t' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
  return { server, call };
}

const passThrough: RequestHandler = (_req, _res, next) => next();

describe('shoppingListRoutes', () => {
  let server: Server;
  let call: Awaited<ReturnType<typeof listen>>['call'];

  beforeAll(async () => {
    ({ server, call } = await listen(passThrough));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each([
    ['GET', BASE],
    ['GET', `${BASE}/summary`],
    ['DELETE', BASE],
    ['POST', `${BASE}/items`],
    ['DELETE', `${BASE}/items/checked`],
    ['PATCH', `${BASE}/items/${ID}`],
    ['DELETE', `${BASE}/items/${ID}`],
  ])('%s %s answers 401 without a session', async (method, route) => {
    expect((await call(method, route)).status).toBe(401);
  });

  it('adds, merges, ticks, clears completed and lists in the documented shapes', async () => {
    const added = await call('POST', `${BASE}/items`, 'u1', {
      items: [
        { label: 'Domates', quantity: 2, unit: 'adet', recipeId: '11111111-1111-4111-8111-111111111111', recipeName: 'Menemen' },
        { label: 'Tuz' },
      ],
    });
    expect(added.status).toBe(201);
    const body = (await added.json()) as { items: Array<{ id: string; label: string }>; added: number; merged: number };
    expect([body.added, body.merged]).toEqual([2, 0]);

    const merged = await call('POST', `${BASE}/items`, 'u1', { items: [{ label: 'domates', quantity: 1, unit: 'Adet' }] });
    expect(((await merged.json()) as { items: Array<{ quantity: number }> }).items[0]?.quantity).toBe(3);

    const salt = body.items[1]!.id;
    const ticked = await call('PATCH', `${BASE}/items/${salt}`, 'u1', { checked: true });
    expect(((await ticked.json()) as { checked: boolean }).checked).toBe(true);

    expect(await (await call('GET', `${BASE}/summary`, 'u1')).json()).toEqual({ unchecked: 1 });
    expect(await (await call('GET', `${BASE}/summary`, 'u2')).json()).toEqual({ unchecked: 0 });

    const page = await call('GET', `${BASE}?page=1&pageSize=20`, 'u1');
    const listed = (await page.json()) as { items: Array<{ label: string; checked: boolean }>; total: number; page: number; pageSize: number };
    expect(listed.items.map((i) => [i.label, i.checked])).toEqual([['Domates', false], ['Tuz', true]]);
    expect([listed.total, listed.page, listed.pageSize]).toEqual([2, 1, 20]);

    const cleared = await call('DELETE', `${BASE}/items/checked`, 'u1');
    expect(await cleared.json()).toEqual({ deleted: 1 });
    expect(await (await call('DELETE', BASE, 'u1')).json()).toEqual({ deleted: 1 });
  });

  it("answers 404 for an id that is someone else's, and 204 for the owner's delete", async () => {
    const added = await call('POST', `${BASE}/items`, 'u1', { items: [{ label: 'Süt' }] });
    const id = ((await added.json()) as { items: Array<{ id: string }> }).items[0]!.id;

    const foreign = await call('DELETE', `${BASE}/items/${id}`, 'u2');
    expect(foreign.status).toBe(404);
    expect(((await foreign.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.not_found.shopping_item');
    expect((await call('DELETE', `${BASE}/items/${id}`, 'u1')).status).toBe(204);
  });

  it('rejects a malformed body with a catalogue key', async () => {
    const empty = await call('POST', `${BASE}/items`, 'u1', { items: [] });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.validation.shopping_batch_invalid');

    const nothing = await call('PATCH', `${BASE}/items/${ID}`, 'u1', {});
    expect(((await nothing.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.validation.nothing_to_edit');
  });
});

describe('shoppingListRoutes rate limit', () => {
  it('answers 429 on writes past the budget but keeps reads open', async () => {
    const limiter = createRateLimitMiddleware({ proxyDepth: 0, windowMs: 60_000, max: 1, messageKey: 'errors.too_many_requests.shopping_list' });
    const { server, call } = await listen(limiter);
    try {
      expect((await call('POST', `${BASE}/items`, 'u1', { items: [{ label: 'A' }] })).status).toBe(201);
      const second = await call('POST', `${BASE}/items`, 'u1', { items: [{ label: 'B' }] });
      expect(second.status).toBe(429);
      expect((await call('GET', BASE, 'u1')).status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
