import { Writable } from 'stream';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { scrubLoggedRequest, scrubLoggedUrl } from '@presentation/http/scrub-logged-url';

describe('scrubLoggedUrl', () => {
  it.each([
    ['/auth/instagram/callback?code=SECRET&state=JWT', '/auth/instagram/callback?[redacted]'],
    ['/webhooks/instagram?hub.mode=subscribe&hub.verify_token=SECRET&hub.challenge=1', '/webhooks/instagram?[redacted]'],
    ['/webhooks/instagram/data-deletion?x=1', '/webhooks/instagram/data-deletion?[redacted]'],
  ])('logs %p without its query', (url, logged) => {
    expect(scrubLoggedUrl(url)).toBe(logged);
  });

  it.each(['/api/v1/recipes?search=ayran', '/webhooks/instagramX?keep=1', '/auth/instagram/callback'])('leaves %p alone', (url) => {
    expect(scrubLoggedUrl(url)).toBe(url);
  });
});

describe('scrubLoggedRequest', () => {
  it('drops the parsed query and params on the secret paths', () => {
    const req = { url: '/auth/instagram/callback?code=SECRET', query: { code: 'SECRET' }, params: { x: '1' }, method: 'GET' };
    expect(scrubLoggedRequest(req)).toEqual({ url: '/auth/instagram/callback?[redacted]', method: 'GET' });
  });

  it('keeps them elsewhere', () => {
    const req = { url: '/api/v1/recipes?search=ayran', query: { search: 'ayran' }, params: {} };
    expect(scrubLoggedRequest(req)).toEqual(req);
  });

  // The URL was redacted but pino-http also logs the parsed `query` object,
  // which still carried Instagram's OAuth code and Meta's verify token.
  it('keeps the OAuth code and verify token out of a real pino-http log line', async () => {
    const lines: string[] = [];
    const sink = new Writable({ write: (chunk: Buffer, _enc, done) => { lines.push(chunk.toString()); done(); } });
    const app = express();
    app.use(pinoHttp({ logger: pino(sink), serializers: { req: scrubLoggedRequest } }));
    app.get('/auth/instagram/callback', (_req, res) => void res.send('ok'));
    app.get('/webhooks/instagram', (_req, res) => void res.send('ok'));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await fetch(`${base}/auth/instagram/callback?code=OAUTH-CODE-SECRET&state=STATE-SECRET`);
    await fetch(`${base}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=VERIFY-SECRET&hub.challenge=1`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const logged = lines.join('');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const secret of ['OAUTH-CODE-SECRET', 'STATE-SECRET', 'VERIFY-SECRET']) expect(logged).not.toContain(secret);
    expect(logged).toContain('/auth/instagram/callback?[redacted]');
  });
});
