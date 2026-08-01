import type { Request } from 'express';
import { clientIp } from '@presentation/middlewares/client-ip';

/**
 * Two proxies sit in front of this app, so `req.ip` is nginx's address and
 * every caller collapses onto one value. Anything keyed on it — rate limits
 * above all — stops distinguishing clients, which turns a per-caller limit into
 * a global one: the first script to hit the cap locks everyone out.
 */

const asRequest = (headers: Record<string, string | undefined>, ip?: string): Request =>
  ({ headers, ip }) as unknown as Request;

describe('clientIp', () => {
  it('prefers the address Cloudflare reports over the socket address', () => {
    const req = asRequest({ 'cf-connecting-ip': '203.0.113.7' }, '172.18.0.1');

    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it('falls back to the socket address when the request did not come through Cloudflare', () => {
    // Local development and the container health probe both look like this.
    const req = asRequest({}, '127.0.0.1');

    expect(clientIp(req)).toBe('127.0.0.1');
  });

  it('ignores an empty header rather than keying every caller on an empty string', () => {
    const req = asRequest({ 'cf-connecting-ip': '' }, '10.0.0.5');

    expect(clientIp(req)).toBe('10.0.0.5');
  });

  it('never returns undefined, so a key always exists', () => {
    expect(clientIp(asRequest({}))).toBe('unknown');
  });

  it('gives two different clients two different keys', () => {
    const a = clientIp(asRequest({ 'cf-connecting-ip': '203.0.113.7' }, '172.18.0.1'));
    const b = clientIp(asRequest({ 'cf-connecting-ip': '198.51.100.4' }, '172.18.0.1'));

    expect(a).not.toBe(b);
  });
});
