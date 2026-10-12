import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express from 'express';
import type { TranslationService } from '@application/i18n/translation-service';
import { decryptEnvelope, type Envelope } from '@infrastructure/crypto/aes-envelope';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { mountJsonParsing } from '@presentation/server/mount-json-parsing';

const KEY = Buffer.alloc(32, 7);
const translations = { t: (key: string) => key, localeFromRequest: () => 'en' } as unknown as TranslationService;

describe('mountJsonParsing', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    mountJsonParsing(app, KEY);
    app.post('/api/v1/echo', (req, res) => { res.json(req.body); });
    app.post('/internal/echo', (req, res) => { res.json(req.body); });
    app.use(createErrorHandler(translations));
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: string): Promise<Response> =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

  it('answers an unreadable API body inside the envelope, not as plain JSON', async () => {
    const res = await post('/api/v1/echo', 'not json{');
    const envelope = (await res.json()) as Envelope;

    expect(res.status).toBe(400);
    expect(typeof envelope.payload).toBe('string');
    expect(decryptEnvelope(envelope, KEY)).toEqual({ error: expect.objectContaining({ code: 'validation' }) });
  });

  it('wraps an API success once', async () => {
    const res = await post('/api/v1/echo', '{"a":1}');

    expect(decryptEnvelope((await res.json()) as Envelope, KEY)).toEqual({ data: { a: 1 } });
  });

  it('leaves routes outside /api/v1 in plain JSON', async () => {
    const res = await post('/internal/echo', '{"a":1}');

    expect(await res.json()).toEqual({ a: 1 });
  });
});
