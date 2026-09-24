import http from 'node:http';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { isPublicAddress } from '@infrastructure/imports/web/public-address';
import { createSafeFetch } from '@infrastructure/imports/web/safe-fetch';

/**
 * A web import fetches whatever address a stranger pastes. These pin the
 * guard between that and the box's own network — the cloud metadata endpoint
 * that hands out credentials, the admin panel on loopback, the database on the
 * private subnet — and the ways a hostile server could hold a worker hostage.
 *
 * Each guard is pinned by flipping ONLY that guard: the same request succeeds
 * with it relaxed and is refused with it in place, so a test cannot pass for
 * some unrelated reason (a wrong port, a closed server).
 */
describe('isPublicAddress', () => {
  it.each([
    ['the cloud metadata endpoint', '169.254.169.254'],
    ['loopback', '127.0.0.1'],
    ['a private subnet', '10.0.0.5'],
    ['another private subnet', '192.168.1.1'],
    ['the carrier-grade NAT range', '100.64.0.1'],
    ['this host', '0.0.0.0'],
    ['IPv6 loopback', '::1'],
    ['an IPv6 unique-local address', 'fd00::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['loopback smuggled as an IPv4-mapped IPv6 address', '::ffff:127.0.0.1'],
    ['the metadata endpoint through NAT64, dotted', '64:ff9b::169.254.169.254'],
    ['the metadata endpoint through NAT64, in hex as getaddrinfo returns it', '64:ff9b::a9fe:a9fe'],
    ['a 6to4 tunnel address', '2002:a9fe:a9fe::1'],
    ['not an address at all', 'example.com'],
  ])('refuses %s', (_why, ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe('safeFetch', () => {
  const hits: Record<string, number> = {};
  let server: http.Server;
  let port = 0;

  const bomb = zlib.gzipSync(Buffer.alloc(8_000_000));
  const partialGzip = zlib.gzipSync(Buffer.from('x'.repeat(200_000))).subarray(0, 200);

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const path = req.url ?? '/';
      hits[path] = (hits[path] ?? 0) + 1;
      if (path === '/page') return void res.end('<html>recipe</html>');
      if (path === '/to-internal') {
        res.writeHead(302, { location: `http://internal.test:${String(port)}/secret` });
        return void res.end();
      }
      if (path === '/loop') {
        res.writeHead(302, { location: '/loop' });
        return void res.end();
      }
      if (path === '/bomb') {
        res.writeHead(200, { 'content-encoding': 'gzip' });
        return void res.end(bomb);
      }
      if (path === '/truncated') {
        res.writeHead(200, { 'content-encoding': 'gzip' });
        res.write(partialGzip);
        setTimeout(() => res.socket?.destroy(), 20);
        return;
      }
      if (path === '/missing') {
        res.writeHead(404);
        return void res.end();
      }
      res.end('secret');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => Object.keys(hits).forEach((k) => delete hits[k]));

  /**
   * Both test names resolve to the one local server; only the guard decides
   * which may be reached. `internal.test` stands for a name pointing inside the box.
   */
  const guarded = (allow: { internal: boolean }) => {
    let lastHost = '';
    return createSafeFetch({
      resolve: async (host) => {
        lastHost = host;
        return [{ address: '127.0.0.1', family: 4 }];
      },
      // The address is the same for both names, so the guard is told which name asked.
      isAllowedAddress: () => lastHost !== 'internal.test' || allow.internal,
      isAllowedUrl: () => true,
    });
  };

  const url = (host: string, path: string): string => `http://${host}:${String(port)}${path}`;
  const opts = { maxBytes: 1_000_000, accept: '*/*' };

  it('reads a page on an allowed address', async () => {
    const r = await guarded({ internal: false })(url('public.test', '/page'), opts);
    expect(r.ok && r.value.body.toString()).toBe('<html>recipe</html>');
  });

  // DNS rebinding: a public-looking name whose record points inside. Only the
  // socket's own lookup can see it; with the guard relaxed the same request
  // gets through, so it is the guard that refused.
  it('refuses a name that resolves inside the box, without connecting', async () => {
    expect((await guarded({ internal: true })(url('internal.test', '/secret'), opts)).ok).toBe(true);
    delete hits['/secret'];

    const r = await guarded({ internal: false })(url('internal.test', '/secret'), opts);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.import.page_unreachable');
    expect(hits['/secret']).toBeUndefined();
  });

  it('re-checks a redirect, so a public page cannot bounce the fetch inside', async () => {
    const r = await guarded({ internal: false })(url('public.test', '/to-internal'), opts);

    expect(r.ok).toBe(false);
    expect(hits['/to-internal']).toBe(1);
    expect(hits['/secret']).toBeUndefined();
  });

  it('re-checks a redirect against the URL rules too', async () => {
    const refusing = createSafeFetch({
      resolve: async () => [{ address: '127.0.0.1', family: 4 }],
      isAllowedAddress: () => true,
      isAllowedUrl: (u) => !u.includes('/secret'),
    });
    const r = await refusing(url('public.test', '/to-internal'), opts);
    expect(r.ok).toBe(false);
    expect(hits['/secret']).toBeUndefined();
  });

  it('gives up on a redirect loop after a bounded number of hops', async () => {
    const r = await guarded({ internal: false })(url('public.test', '/loop'), opts);
    expect(r.ok).toBe(false);
    expect(hits['/loop']).toBe(5);
  });

  it('caps the body after decompression, so a small gzip cannot inflate past it', async () => {
    const r = await guarded({ internal: false })(url('public.test', '/bomb'), opts);
    expect(r.ok).toBe(false);
  });

  // The hang this pins: a gzip body cut off mid-stream used to leave the
  // decompressor waiting forever, and the worker stopped claiming jobs.
  it('fails, rather than hangs, on a compressed body the server cuts off', async () => {
    const r = await guarded({ internal: false })(url('public.test', '/truncated'), opts);
    expect(r.ok).toBe(false);
  }, 5000);

  it('treats an error status as unreachable', async () => {
    const r = await guarded({ internal: false })(url('public.test', '/missing'), opts);
    expect(r.ok).toBe(false);
  });

  it('never outlives its signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const r = await guarded({ internal: false })(url('public.test', '/page'), { ...opts, signal: controller.signal });
    expect(r.ok).toBe(false);
  });
});
