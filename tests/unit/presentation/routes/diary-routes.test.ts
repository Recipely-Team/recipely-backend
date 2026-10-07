import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express from 'express';
import { ok } from '@core/result/result';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { TranslationService } from '@application/i18n/translation-service';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import { GetDiaryDayUseCase } from '@application/diary/use-cases/get-diary-day-use-case';
import { GetDiaryMonthUseCase } from '@application/diary/use-cases/get-diary-month-use-case';
import { ListRecentFoodsUseCase } from '@application/diary/use-cases/list-recent-foods-use-case';
import { AddFoodLogEntryUseCase } from '@application/diary/use-cases/add-food-log-entry-use-case';
import { UpdateFoodLogEntryUseCase } from '@application/diary/use-cases/update-food-log-entry-use-case';
import { DeleteFoodLogEntryUseCase } from '@application/diary/use-cases/delete-food-log-entry-use-case';
import { SetDayWaterUseCase } from '@application/diary/use-cases/set-day-water-use-case';
import { GetNutritionGoalsUseCase } from '@application/diary/use-cases/get-nutrition-goals-use-case';
import { SetNutritionGoalsUseCase } from '@application/diary/use-cases/set-nutrition-goals-use-case';
import { DiaryController } from '@presentation/controllers/diary.controller';
import { diaryRoutes } from '@presentation/routes/diary.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { InMemoryFoodDiaryRepository } from '../../fixtures/in-memory-food-diary-repository';
import { brandedProduct, brandedWith, catalogWith, curatedProduct } from '../../fixtures/food-products';
import { ListRecentFoodsPageUseCase } from '@application/diary/use-cases/list-recent-foods-page-use-case';
import { ListFoodProductsUseCase } from '@application/foods/use-cases/list-food-products-use-case';
import { GetFoodProductUseCase } from '@application/foods/use-cases/get-food-product-use-case';
import { GetBrandedProductUseCase } from '@application/foods/use-cases/get-branded-product-use-case';
import { ListFoodCategoriesUseCase } from '@application/foods/use-cases/list-food-categories-use-case';
import { SearchDiaryFoodsUseCase } from '@application/diary/use-cases/search-diary-foods-use-case';
import { ParseMealUseCase } from '@application/diary/use-cases/parse-meal-use-case';
import { ModerationStatus } from '@domain/moderation/moderation-status';

/**
 * The diary is private health-like data: every route needs a session, and one
 * user's entry ids are invisible to everyone else. Mounted exactly as `app.ts`
 * mounts it, over the real controller, use cases and error handler.
 */

const ENTRY = { date: '2026-09-30', meal: 'LUNCH', name: 'Menemen', servings: 2, calories: 600, protein: 30, carbs: 20, fat: 40 };

const MEAL_ITEM = {
  label: 'Ayran', searchTerm: 'ayran', grams: 200, confidence: 0.9,
  estimate: { kcal: 70, protein: 3, carbs: 5, fat: 3, fiber: 0 },
};

function startServer(): { server: Server; tokens: TokenSignerInterface } {
  const repo = new InMemoryFoodDiaryRepository();
  const recipes = { getById: jest.fn().mockResolvedValue(ok({})) } as unknown as RecipeRepositoryInterface;
  const ts = { t: (key: string) => key } as unknown as TranslationService;
  const tokens = { sign: jest.fn(), verify: jest.fn() } as unknown as TokenSignerInterface;
  const liveAccount = new EnsureAccountActiveUseCase({
    getAccountStatus: jest.fn().mockResolvedValue(ok({ deletedAt: null, suspendedAt: null, role: 'user' })),
  } as unknown as AuthRepositoryInterface);
  const controller = new DiaryController(
    {
      getDay: new GetDiaryDayUseCase(repo),
      getMonth: new GetDiaryMonthUseCase(repo),
      listRecent: new ListRecentFoodsUseCase(repo),
      addEntry: new AddFoodLogEntryUseCase(repo, recipes, catalogWith(curatedProduct())),
      updateEntry: new UpdateFoodLogEntryUseCase(repo),
      deleteEntry: new DeleteFoodLogEntryUseCase(repo),
      setWater: new SetDayWaterUseCase(repo),
      getGoals: new GetNutritionGoalsUseCase(repo),
      setGoals: new SetNutritionGoalsUseCase(repo),
      searchFoods: new SearchDiaryFoodsUseCase(
        { search: jest.fn(async ({ page, pageSize }) => ok({ items: [], total: 0, page, pageSize })) },
        catalogWith(),
        brandedWith(),
        { warn: jest.fn() },
      ),
      listRecentPage: new ListRecentFoodsPageUseCase(repo),
      listProducts: new ListFoodProductsUseCase(catalogWith(curatedProduct())),
      getProduct: new GetFoodProductUseCase(catalogWith(curatedProduct())),
      getBrandedProduct: new GetBrandedProductUseCase(brandedWith(brandedProduct())),
      listCategories: new ListFoodCategoriesUseCase(catalogWith()),
      parseMeal: new ParseMealUseCase(
        { parse: jest.fn().mockResolvedValue(ok([MEAL_ITEM])) },
        catalogWith(curatedProduct()),
        { consume: jest.fn().mockResolvedValue(ok(1)), refund: jest.fn() },
        { moderate: () => ({ status: ModerationStatus.Approved }) },
        { moderate: jest.fn().mockResolvedValue(ok({ status: ModerationStatus.Approved })) },
        { prepare: jest.fn(async (bytes: Buffer) => ok({ image: bytes, mimeType: 'image/jpeg' })) },
      ),
    },
    ts,
  );

  const app = express();
  app.use(express.json());
  app.use('/diary', diaryRoutes(controller, createAuthMiddleware(tokens, liveAccount), (_req, _res, next) => next()));
  app.use(createErrorHandler(ts));
  return { server: http.createServer(app), tokens };
}

const ROUTES: readonly [string, string][] = [
  ['GET', '/diary/days/2026-09-30'],
  ['PUT', '/diary/days/2026-09-30/water'],
  ['GET', '/diary/months/2026-09'],
  ['GET', '/diary/recent'],
  ['GET', '/diary/foods/search?q=ayran'],
  ['GET', '/diary/foods/recent'],
  ['GET', '/diary/foods/categories'],
  ['GET', '/diary/foods/products'],
  ['GET', '/diary/foods/products/22222222-2222-4222-8222-222222222222'],
  ['GET', '/diary/foods/products/barcode/8681324002837'],
  ['POST', '/diary/entries'],
  ['PATCH', '/diary/entries/00000000-0000-4000-8000-000000000000'],
  ['DELETE', '/diary/entries/00000000-0000-4000-8000-000000000000'],
  ['GET', '/diary/goals'],
  ['PUT', '/diary/goals'],
  ['POST', '/diary/meal-parse'],
];

describe('diaryRoutes', () => {
  let server: Server;
  let tokens: TokenSignerInterface;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, tokens } = startServer());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const call = (method: string, route: string, user?: string, body?: unknown): Promise<Response> => {
    if (user !== undefined) (tokens.verify as jest.Mock).mockResolvedValueOnce(ok({ sub: user, email: `${user}@x.test` }));
    return fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(user === undefined ? {} : { authorization: 'Bearer t' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };

  it.each(ROUTES)('%s %s answers 401 without a session', async (method, route) => {
    expect((await call(method, route)).status).toBe(401);
  });

  it("logs an entry for its owner and hides it from everyone else as not_found", async () => {
    const created = await call('POST', '/diary/entries', 'alice', ENTRY);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const stranger = await call('PATCH', `/diary/entries/${id}`, 'mallory', { servings: 1 });
    expect(stranger.status).toBe(404);
    expect(((await stranger.json()) as { error: { messageKey: string } }).error.messageKey).toBe(
      'errors.not_found.diary_entry',
    );

    const owner = await call('PATCH', `/diary/entries/${id}`, 'alice', { servings: 1 });
    expect(owner.status).toBe(200);
    expect(await owner.json()).toMatchObject({ servings: 1, calories: 300 });

    expect((await call('DELETE', `/diary/entries/${id}`, 'mallory')).status).toBe(404);
    expect((await call('DELETE', `/diary/entries/${id}`, 'alice')).status).toBe(204);
  });

  it('searches foods for a signed-in user, and refuses an empty query with a catalogue key', async () => {
    const found = await call('GET', '/diary/foods/search?q=ayran', 'alice');
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({
      query: 'ayran',
      saved: { items: [], total: 0, page: 1, pageSize: 20 },
      mine: { items: [], total: 0 },
      products: { items: [], total: 0 },
      recipes: { items: [], total: 0 },
    });

    const onePage = await call('GET', '/diary/foods/search?q=ayran&group=recipes&page=2&pageSize=5', 'alice');
    expect(await onePage.json()).toEqual({ items: [], total: 0, page: 2, pageSize: 5 });

    const tab = await call('GET', '/diary/foods/search?group=mine', 'alice');
    expect(tab.status).toBe(200);
    expect(await tab.json()).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });

    const badGroup = await call('GET', '/diary/foods/search?q=ayran&group=everything', 'alice');
    expect(badGroup.status).toBe(400);

    const empty = await call('GET', '/diary/foods/search?q=%20', 'alice');
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.validation.search_query_required');
  });

  it('logs a product by its unit and reads the catalogue through the foods routes', async () => {
    const created = await call('POST', '/diary/entries', 'alice', {
      ...ENTRY, name: 'Ayran · Az yağlı', servings: 2, calories: 112,
      product: { source: 'curated', foodVariantId: '11111111-1111-4111-8111-111111111111', unitKey: 'glass' },
    });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { product: unknown }).product).toEqual({
      source: 'curated', foodVariantId: '11111111-1111-4111-8111-111111111111', offBarcode: null, unitKey: 'glass', unitAmount: 200,
    });

    const recent = await call('GET', '/diary/foods/recent?pageSize=5', 'alice');
    expect(await recent.json()).toMatchObject({
      total: 1, page: 1, pageSize: 5,
      items: [{ servings: 2, calories: 112, product: { unitKey: 'glass', perUnit: { kcal: 56 } } }],
    });

    const detail = await call('GET', '/diary/foods/products/22222222-2222-4222-8222-222222222222', 'alice');
    expect(await detail.json()).toMatchObject({ foodId: '22222222-2222-4222-8222-222222222222', variants: [{ servingUnits: [{ key: 'glass', amount: 200 }] }] });

    const barcode = await call('GET', '/diary/foods/products/barcode/8681324002837', 'alice');
    expect(await barcode.json()).toMatchObject({ offBarcode: '8681324002837', brand: 'Sütaş' });

    const unknown = await call('GET', '/diary/foods/products/barcode/12345678', 'alice');
    expect(unknown.status).toBe(404);

    const products = await call('GET', '/diary/foods/products?category=drinks', 'alice');
    expect(await products.json()).toMatchObject({ total: 1, page: 1, pageSize: 20 });

    const categories = await call('GET', '/diary/foods/categories', 'alice');
    expect(await categories.json()).toMatchObject({ items: [{ key: 'drinks', name: 'Drinks' }], total: 1 });
  });

  it('refuses an impossible date with a catalogue key', async () => {
    const res = await call('GET', '/diary/days/2026-02-30', 'alice');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.validation.date_invalid');
  });

  it('parses a typed meal into candidates matched against the catalogue', async () => {
    const parsed = await call('POST', '/diary/meal-parse', 'alice', { text: 'ayran', locale: 'tr' });
    expect(parsed.status).toBe(200);
    expect(await parsed.json()).toMatchObject({
      items: [{ label: 'Ayran', grams: 200, match: { kind: 'food', id: '11111111-1111-4111-8111-111111111111' }, estimated: false }],
    });
  });

  it('parses a multipart plate photo, and refuses a request with neither text nor photo', async () => {
    (tokens.verify as jest.Mock).mockResolvedValueOnce(ok({ sub: 'alice', email: 'alice@x.test' }));
    const form = new FormData();
    form.append('photo', new Blob([Buffer.from('jpeg-bytes')], { type: 'image/jpeg' }), 'plate.jpg');
    const photo = await fetch(`${baseUrl}/diary/meal-parse`, { method: 'POST', headers: { authorization: 'Bearer t' }, body: form });
    expect(photo.status).toBe(200);
    expect(((await photo.json()) as { items: unknown[] }).items).toHaveLength(1);

    const empty = await call('POST', '/diary/meal-parse', 'alice', {});
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.meal_parse.input_required');
  });
});
