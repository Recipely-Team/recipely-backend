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

/**
 * The diary is private health-like data: every route needs a session, and one
 * user's entry ids are invisible to everyone else. Mounted exactly as `app.ts`
 * mounts it, over the real controller, use cases and error handler.
 */

const ENTRY = { date: '2026-09-30', meal: 'LUNCH', name: 'Menemen', servings: 2, calories: 600, protein: 30, carbs: 20, fat: 40 };

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
      addEntry: new AddFoodLogEntryUseCase(repo, recipes),
      updateEntry: new UpdateFoodLogEntryUseCase(repo),
      deleteEntry: new DeleteFoodLogEntryUseCase(repo),
      setWater: new SetDayWaterUseCase(repo),
      getGoals: new GetNutritionGoalsUseCase(repo),
      setGoals: new SetNutritionGoalsUseCase(repo),
    },
    ts,
  );

  const app = express();
  app.use(express.json());
  app.use('/diary', diaryRoutes(controller, createAuthMiddleware(tokens, liveAccount)));
  app.use(createErrorHandler(ts));
  return { server: http.createServer(app), tokens };
}

const ROUTES: readonly [string, string][] = [
  ['GET', '/diary/days/2026-09-30'],
  ['PUT', '/diary/days/2026-09-30/water'],
  ['GET', '/diary/months/2026-09'],
  ['GET', '/diary/recent'],
  ['POST', '/diary/entries'],
  ['PATCH', '/diary/entries/00000000-0000-4000-8000-000000000000'],
  ['DELETE', '/diary/entries/00000000-0000-4000-8000-000000000000'],
  ['GET', '/diary/goals'],
  ['PUT', '/diary/goals'],
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

  it('refuses an impossible date with a catalogue key', async () => {
    const res = await call('GET', '/diary/days/2026-02-30', 'alice');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.validation.date_invalid');
  });
});
