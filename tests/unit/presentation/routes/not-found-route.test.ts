import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express from 'express';
import { NotFoundFailure } from '@core/failure';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { createTestTranslationService } from '../../../helpers/translation';

/**
 * Mirrors the tail of `createApp`: an unmatched path falls through to a terminal
 * middleware that hands a `NotFoundFailure` to `next`, and the error handler —
 * mounted last — turns it into the same keyed body every other error gets.
 */
function startServer(): Server {
  const app = express();
  app.get('/recipes', (_req, res) => {
    res.status(200).json({ items: [] });
  });
  app.use((_req, _res, next) => {
    next(new NotFoundFailure('errors.not_found.route'));
  });
  app.use(createErrorHandler(createTestTranslationService()));
  return http.createServer(app);
}

describe('unmatched routes', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = startServer();
    await new Promise<void>(resolve => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('answers 404 with a catalogue key, like every other error', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    const body = (await res.json()) as { error: Record<string, string> };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('not_found');
    expect(body.error.messageKey).toBe('errors.not_found.route');
    expect(body.error.message).toBe('The requested resource was not found.');
  });

  it('still routes a matched path normally', async () => {
    const res = await fetch(`${baseUrl}/recipes`);

    expect(res.status).toBe(200);
  });
});
