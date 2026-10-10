import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express, { type RequestHandler } from 'express';
import { ok } from '@core/result/result';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { Difficulty } from '@domain/recipes/difficulty';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { TranslationService } from '@application/i18n/translation-service';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import { ScanFridgeUseCase } from '@application/fridge/use-cases/scan-fridge-use-case';
import { SuggestFridgeIdeasUseCase } from '@application/fridge/use-cases/suggest-fridge-ideas-use-case';
import { FridgeLimits } from '@application/fridge/fridge-limits';
import { FridgeController } from '@presentation/controllers/fridge/fridge.controller';
import { fridgeRoutes } from '@presentation/routes/fridge/fridge.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createErrorHandler } from '@presentation/middlewares/error-handler';

/**
 * Mounted the way `app.ts` mounts it, over the real controller, use cases,
 * validators, multer and error handler: sessions required, photo counts keyed,
 * one allowance across both routes, and moderation drops model text.
 */

const moderator: ContentModeratorInterface = {
  moderate: ({ text }) =>
    text.includes('badword')
      ? { status: ModerationStatus.Rejected, hit: { category: 'profanity', term: 'badword' } }
      : { status: ModerationStatus.Approved },
};

function startServer() {
  const counts = new Map<string, number>();
  const usage = {
    consume: async (userId: string) => {
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
      return ok(counts.get(userId) ?? 0);
    },
    refund: async () => undefined,
  };
  const scanner = {
    scan: jest.fn().mockResolvedValue(ok([{ name: 'Egg', confidence: 'high' }, { name: 'badword cheese', confidence: 'high' }])),
  };
  const idea = (title: string) => ({ title, summary: 'Quick.', totalMinutes: 10, difficulty: Difficulty.Easy, uses: ['egg'], missing: ['salt', 'bread'] });
  const generator = { suggest: jest.fn().mockResolvedValue(ok([idea('Omelette'), idea('badword pie'), idea('Fried egg'), idea('Egg toast')])) };
  const imageModerator = { moderate: jest.fn().mockResolvedValue(ok({ status: ModerationStatus.Approved })) };
  const photos = { prepare: async (bytes: Buffer) => ok({ image: bytes, mimeType: 'image/jpeg' }) };
  const ts = { t: (key: string) => key } as unknown as TranslationService;
  const tokens = { sign: jest.fn(), verify: jest.fn() } as unknown as TokenSignerInterface;
  const liveAccount = new EnsureAccountActiveUseCase({
    getAccountStatus: jest.fn().mockResolvedValue(ok({ deletedAt: null, suspendedAt: null, role: 'user' })),
  } as unknown as AuthRepositoryInterface);
  const controller = new FridgeController(
    new ScanFridgeUseCase(scanner, usage, moderator, imageModerator, photos),
    new SuggestFridgeIdeasUseCase(generator, usage, moderator),
    ts,
  );
  const passThrough: RequestHandler = (_req, _res, next) => next();
  const app = express();
  app.use(express.json());
  app.use('/fridge', fridgeRoutes(controller, createAuthMiddleware(tokens, liveAccount), passThrough));
  app.use(createErrorHandler(ts));
  return { server: http.createServer(app), tokens };
}

type Body = Record<string, unknown> & { error?: { messageKey: string } };

describe('fridgeRoutes', () => {
  let server: Server;
  let baseUrl: string;
  let tokens: TokenSignerInterface;

  const signIn = (user: string) => (tokens.verify as jest.Mock).mockResolvedValueOnce(ok({ sub: user, email: `${user}@x.test` }));
  const auth = (user?: string): Record<string, string> => (user === undefined ? {} : (signIn(user), { authorization: 'Bearer t' }));
  const scan = async (user: string | undefined, count: number): Promise<{ status: number; body: Body }> => {
    const form = new FormData();
    for (let i = 0; i < count; i += 1) form.append('photos', new Blob([Buffer.from(`jpeg-${i}`)], { type: 'image/jpeg' }), `p${i}.jpg`);
    const res = await fetch(`${baseUrl}/fridge/scan`, { method: 'POST', headers: auth(user), body: form });
    return { status: res.status, body: (await res.json()) as Body };
  };
  const ideas = async (user: string | undefined, body: unknown): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${baseUrl}/fridge/ideas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(user) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Body };
  };

  beforeAll(async () => {
    const started = startServer();
    ({ server, tokens } = started);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('answers 401 on both routes without a session', async () => {
    expect((await scan(undefined, 1)).status).toBe(401);
    expect((await ideas(undefined, { ingredients: ['egg'] })).status).toBe(401);
  });

  it('scans up to three photos and drops a flagged name', async () => {
    const res = await scan('u1', 3);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ingredients: [{ name: 'egg', confidence: 'high' }] });
  });

  it('keys no photo and a fourth photo', async () => {
    const none = await scan('u1', 0);
    expect([none.status, none.body.error?.messageKey]).toEqual([400, 'errors.fridge.no_photos']);
    const four = await scan('u1', 4);
    expect([four.status, four.body.error?.messageKey]).toEqual([400, 'errors.fridge.too_many_photos']);
  });

  it('answers three ideas without staples in missing, a flagged idea dropped', async () => {
    const res = await ideas('u2', { ingredients: ['egg'], maxMinutes: 15, diet: 'vegetarian', servings: 2, locale: 'en' });
    expect(res.status).toBe(200);
    const list = res.body['ideas'] as Array<{ title: string; missing: string[]; uses: string[] }>;
    expect(list.map((i) => i.title)).toEqual(['Omelette', 'Fried egg', 'Egg toast']);
    expect(list[0]).toEqual({ title: 'Omelette', summary: 'Quick.', totalMinutes: 10, difficulty: 'EASY', uses: ['egg'], missing: ['bread'] });
    const invalid = await ideas('u2', { ingredients: [] });
    expect([invalid.status, invalid.body.error?.messageKey]).toEqual([400, 'errors.fridge.ingredients_required']);
  });

  it(`shares one allowance of ${FridgeLimits.dailyPerUser} across scan and ideas, then answers 429`, async () => {
    for (let i = 0; i < FridgeLimits.dailyPerUser / 2; i += 1) {
      expect((await scan('u3', 1)).status).toBe(200);
      expect((await ideas('u3', { ingredients: ['egg'] })).status).toBe(200);
    }
    const scanOver = await scan('u3', 1);
    const ideasOver = await ideas('u3', { ingredients: ['egg'] });
    expect([scanOver.status, scanOver.body.error?.messageKey]).toEqual([429, 'errors.fridge.quota_exceeded']);
    expect([ideasOver.status, ideasOver.body.error?.messageKey]).toEqual([429, 'errors.fridge.quota_exceeded']);
  });
});
