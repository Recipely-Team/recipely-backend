import type { Request } from 'express';
import { clientIp } from '@presentation/middlewares/client-ip';

/**
 * This function decides the rate-limit key, so it decides whether a limit can
 * be evaded. Two failures matter, in opposite directions:
 *
 *   Too trusting — believing `CF-Connecting-IP` on a hostname Cloudflare does
 *   not proxy. Nothing overwrites the header there, so a caller sets a new
 *   value per request, gets a fresh key every time, and never reaches a limit.
 *
 *   Not trusting enough — falling back to the socket address where Cloudflare
 *   IS in front. Every caller then shares nginx's address, so one script hitting
 *   the cap locks out everyone.
 *
 * `api.recipely.net` is DNS-only (depth 1) and `dev-api.recipely.net` is
 * proxied (depth 2), so both cases are live at the same time.
 */

const DIRECT = 1;
const VIA_CLOUDFLARE = 2;

const asRequest = (headers: Record<string, string | undefined>, ip?: string): Request =>
  ({ headers, ip }) as unknown as Request;

describe('clientIp on a hostname Cloudflare does NOT proxy', () => {
  it('ignores a CF-Connecting-IP the caller wrote itself', () => {
    const req = asRequest({ 'cf-connecting-ip': '1.2.3.4' }, '203.0.113.7');

    expect(clientIp(req, DIRECT)).toBe('203.0.113.7');
  });

  it('gives one caller one key however many values they try', () => {
    const forged = ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((v) =>
      clientIp(asRequest({ 'cf-connecting-ip': v }, '203.0.113.7'), DIRECT),
    );

    expect(new Set(forged).size).toBe(1);
  });
});

describe('clientIp on a hostname Cloudflare proxies', () => {
  it('uses the address Cloudflare reports, not the socket address', () => {
    const req = asRequest({ 'cf-connecting-ip': '203.0.113.7' }, '172.18.0.1');

    expect(clientIp(req, VIA_CLOUDFLARE)).toBe('203.0.113.7');
  });

  it('separates two clients that share the proxy socket', () => {
    const a = clientIp(asRequest({ 'cf-connecting-ip': '203.0.113.7' }, '172.18.0.1'), VIA_CLOUDFLARE);
    const b = clientIp(asRequest({ 'cf-connecting-ip': '198.51.100.4' }, '172.18.0.1'), VIA_CLOUDFLARE);

    expect(a).not.toBe(b);
  });

  it('falls back when the header is missing or blank', () => {
    expect(clientIp(asRequest({}, '10.0.0.5'), VIA_CLOUDFLARE)).toBe('10.0.0.5');
    expect(clientIp(asRequest({ 'cf-connecting-ip': '' }, '10.0.0.5'), VIA_CLOUDFLARE)).toBe('10.0.0.5');
  });
});

describe('clientIp always produces a key', () => {
  it('never returns undefined', () => {
    expect(clientIp(asRequest({}), DIRECT)).toBe('unknown');
  });
});
