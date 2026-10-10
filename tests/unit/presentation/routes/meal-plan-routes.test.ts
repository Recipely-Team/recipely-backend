import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express, { type RequestHandler } from 'express';
import { ok } from '@core/result/result';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { TranslationService } from '@application/i18n/translation-service';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import { AddFoodLogEntryUseCase } from '@application/diary/use-cases/add-food-log-entry-use-case';
import { GetMealPlanUseCase } from '@application/meal-plan/use-cases/get-meal-plan-use-case';
import { AddMealPlanEntryUseCase } from '@application/meal-plan/use-cases/add-meal-plan-entry-use-case';
import { UpdateMealPlanEntryUseCase } from '@application/meal-plan/use-cases/update-meal-plan-entry-use-case';
import { DeleteMealPlanEntryUseCase } from '@application/meal-plan/use-cases/delete-meal-plan-entry-use-case';
import { MarkMealPlanEntryEatenUseCase } from '@application/meal-plan/use-cases/mark-meal-plan-entry-eaten-use-case';
import { UnmarkMealPlanEntryEatenUseCase } from '@application/meal-plan/use-cases/unmark-meal-plan-entry-eaten-use-case';
import { CopyMealPlanWeekUseCase } from '@application/meal-plan/use-cases/copy-meal-plan-week-use-case';
import { ClearMealPlanRangeUseCase } from '@application/meal-plan/use-cases/clear-meal-plan-range-use-case';
import { ListMealPlanIngredientsUseCase } from '@application/meal-plan/use-cases/list-meal-plan-ingredients-use-case';
import { MealPlanController } from '@presentation/controllers/meal-plan/meal-plan.controller';
import { mealPlanRoutes } from '@presentation/routes/meal-plan/meal-plan.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { InMemoryMealPlanRepository, recipeRepoOver } from '../../fixtures/in-memory-meal-plan-repository';
import { InMemoryFoodDiaryRepository } from '../../fixtures/in-memory-food-diary-repository';
import { recipe, recipeProps } from '../../fixtures/recipe-fixture';

/**
 * Mounted the way `app.ts` mounts it, over the real controller, use cases,
 * validators and error handler: every route needs a session, ids are scoped to
 * their owner, ranges are capped, a day is capped, and eaten is idempotent.
 */

const BASE = '/me/meal-plan';
const ID = '00000000-0000-4000-8000-000000000000';
const SOUP = '11111111-1111-4111-8111-111111111111';
const MON = '2026-10-12';

function startServer(): { server: Server; tokens: TokenSignerInterface; diary: InMemoryFoodDiaryRepository } {
  const repo = new InMemoryMealPlanRepository();
  repo.recipes.set(SOUP, recipe(recipeProps({ id: SOUP, name: { en: 'Soup' }, isPublished: true, caloriesPerServing: 200 })));
  const diary = new InMemoryFoodDiaryRepository();
  const recipes = recipeRepoOver(repo);
  const ts = { t: (key: string) => key } as unknown as TranslationService;
  const tokens = { sign: jest.fn(), verify: jest.fn() } as unknown as TokenSignerInterface;
  const liveAccount = new EnsureAccountActiveUseCase({
    getAccountStatus: jest.fn().mockResolvedValue(ok({ deletedAt: null, suspendedAt: null, role: 'user' })),
  } as unknown as AuthRepositoryInterface);
  const controller = new MealPlanController(
    {
      get: new GetMealPlanUseCase(repo),
      add: new AddMealPlanEntryUseCase(repo, recipes),
      update: new UpdateMealPlanEntryUseCase(repo),
      remove: new DeleteMealPlanEntryUseCase(repo),
      markEaten: new MarkMealPlanEntryEatenUseCase(repo, new AddFoodLogEntryUseCase(diary, recipes, {} as FoodCatalogInterface), diary),
      unmarkEaten: new UnmarkMealPlanEntryEatenUseCase(repo, diary),
      copyWeek: new CopyMealPlanWeekUseCase(repo),
      clearRange: new ClearMealPlanRangeUseCase(repo),
      ingredients: new ListMealPlanIngredientsUseCase(repo),
    },
    ts,
  );
  const passThrough: RequestHandler = (_req, _res, next) => next();
  const app = express();
  app.use(express.json());
  app.use(BASE, mealPlanRoutes(controller, createAuthMiddleware(tokens, liveAccount), passThrough));
  app.use(createErrorHandler(ts));
  return { server: http.createServer(app), tokens, diary };
}

type Body = Record<string, unknown> & { error?: { messageKey: string } };

describe('mealPlanRoutes', () => {
  let server: Server;
  let diary: InMemoryFoodDiaryRepository;
  let call: (method: string, route: string, user?: string, body?: unknown) => Promise<{ status: number; body: Body }>;

  beforeAll(async () => {
    const started = startServer();
    ({ server, diary } = started);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    call = async (method, route, user, body) => {
      if (user !== undefined) (started.tokens.verify as jest.Mock).mockResolvedValueOnce(ok({ sub: user, email: `${user}@x.test` }));
      const res = await fetch(`${baseUrl}${route}`, {
        method,
        headers: { 'content-type': 'application/json', ...(user === undefined ? {} : { authorization: 'Bearer t' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: res.status, body: res.status === 204 ? {} : ((await res.json()) as Body) };
    };
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each([
    ['GET', `${BASE}?from=${MON}&to=${MON}`],
    ['DELETE', `${BASE}?from=${MON}&to=${MON}`],
    ['GET', `${BASE}/ingredients?from=${MON}&to=${MON}`],
    ['POST', `${BASE}/copy`],
    ['POST', `${BASE}/entries`],
    ['PATCH', `${BASE}/entries/${ID}`],
    ['DELETE', `${BASE}/entries/${ID}`],
    ['POST', `${BASE}/entries/${ID}/eaten`],
    ['DELETE', `${BASE}/entries/${ID}/eaten`],
  ])('%s %s answers 401 without a session', async (method, route) => {
    expect((await call(method, route)).status).toBe(401);
  });

  it('plans, reads, eats idempotently, un-eats and deletes in the documented shapes', async () => {
    const added = await call('POST', `${BASE}/entries`, 'u1', { date: MON, meal: 'DINNER', recipeId: SOUP, servings: 2 });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      date: MON, meal: 'DINNER', position: 0, servings: 2, eaten: false, foodLogEntryId: null,
      recipe: { id: SOUP, name: 'Soup', imageUrl: null, caloriesPerServing: 200, servings: 2, totalTimeMinutes: 30 },
    });
    const id = added.body['id'] as string;

    const week = await call('GET', `${BASE}?from=${MON}&to=2026-10-18`, 'u1');
    expect(week.status).toBe(200);
    expect([week.body['from'], week.body['to'], (week.body['entries'] as unknown[]).length]).toEqual([MON, '2026-10-18', 1]);

    const eaten = await call('POST', `${BASE}/entries/${id}/eaten`, 'u1');
    const again = await call('POST', `${BASE}/entries/${id}/eaten`, 'u1');
    expect([eaten.status, again.status, eaten.body['eaten']]).toEqual([200, 200, true]);
    expect(again.body['foodLogEntryId']).toBe(eaten.body['foodLogEntryId']);
    expect(diary.entries.size).toBe(1);

    const undone = await call('DELETE', `${BASE}/entries/${id}/eaten`, 'u1');
    expect([undone.status, undone.body['eaten'], diary.entries.size]).toEqual([200, false, 0]);

    const moved = await call('PATCH', `${BASE}/entries/${id}`, 'u1', { meal: 'LUNCH', servings: 1.5 });
    expect([moved.body['meal'], moved.body['servings']]).toEqual(['LUNCH', 1.5]);

    const ingredients = await call('GET', `${BASE}/ingredients?from=${MON}&to=${MON}`, 'u1');
    expect(ingredients.body).toEqual({
      recipes: [{ recipeId: SOUP, recipeName: 'Soup', plannedServings: 1.5, recipeServings: 2, ingredients: ['pasta', 'sauce'] }],
    });

    const copied = await call('POST', `${BASE}/copy`, 'u1', { fromWeekStart: MON, toWeekStart: '2026-10-19' });
    expect([copied.status, copied.body]).toEqual([200, { copied: 1, skipped: 0 }]);

    expect((await call('DELETE', `${BASE}/entries/${id}`, 'u1')).status).toBe(204);
    expect((await call('DELETE', `${BASE}?from=2026-10-19&to=2026-10-25`, 'u1')).status).toBe(204);
    const empty = await call('GET', `${BASE}?from=${MON}&to=2026-10-25`, 'u1');
    expect(empty.body['entries']).toEqual([]);
  });

  it("answers 404 for someone else's row, and the not-found key for a malformed id", async () => {
    const added = await call('POST', `${BASE}/entries`, 'u1', { date: MON, meal: 'LUNCH', recipeId: SOUP, servings: 1 });
    const id = added.body['id'] as string;
    for (const [method, route] of [['PATCH', `/entries/${id}`], ['DELETE', `/entries/${id}`], ['POST', `/entries/${id}/eaten`]] as const) {
      const foreign = await call(method, `${BASE}${route}`, 'u2', method === 'PATCH' ? { servings: 1 } : undefined);
      expect([foreign.status, foreign.body.error?.messageKey]).toEqual([404, 'errors.not_found.meal_plan_entry']);
    }
    const malformed = await call('DELETE', `${BASE}/entries/not-a-uuid`, 'u1');
    expect([malformed.status, malformed.body.error?.messageKey]).toEqual([400, 'errors.not_found.meal_plan_entry']);
  });

  it('refuses a range past 14 days, a missing range and a backwards one with 400', async () => {
    for (const query of [`from=${MON}&to=2026-10-26`, `from=${MON}`, `from=${MON}&to=2026-10-01`]) {
      const res = await call('GET', `${BASE}?${query}`, 'u1');
      expect([res.status, res.body.error?.messageKey]).toEqual([400, 'errors.validation.meal_plan_range_invalid']);
    }
    expect((await call('DELETE', `${BASE}?from=${MON}&to=2026-10-26`, 'u1')).status).toBe(400);
  });

  it(`answers 409 for the ${MealPlanLimits.EntriesPerDayMax + 1}th dish of a day`, async () => {
    const day = '2026-11-02';
    for (let i = 0; i < MealPlanLimits.EntriesPerDayMax; i += 1) {
      expect((await call('POST', `${BASE}/entries`, 'u3', { date: day, meal: 'SNACK', recipeId: SOUP, servings: 1 })).status).toBe(201);
    }
    const full = await call('POST', `${BASE}/entries`, 'u3', { date: day, meal: 'DINNER', recipeId: SOUP, servings: 1 });
    expect([full.status, full.body.error?.messageKey]).toEqual([409, 'errors.conflict.meal_plan_day_full']);
  });

  it('rejects malformed bodies with catalogue keys', async () => {
    const servings = await call('POST', `${BASE}/entries`, 'u1', { date: MON, meal: 'DINNER', recipeId: SOUP, servings: 0 });
    expect([servings.status, servings.body.error?.messageKey]).toEqual([400, 'errors.validation.servings_invalid']);
    const unknownRecipe = await call('POST', `${BASE}/entries`, 'u1', { date: MON, meal: 'DINNER', recipeId: ID, servings: 1 });
    expect([unknownRecipe.status, unknownRecipe.body.error?.messageKey]).toEqual([404, 'errors.not_found.recipe']);
    const nothing = await call('PATCH', `${BASE}/entries/${ID}`, 'u1', {});
    expect(nothing.body.error?.messageKey).toBe('errors.validation.nothing_to_edit');
  });
});
