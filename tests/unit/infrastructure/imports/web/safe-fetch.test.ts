import dns from 'node:dns';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { isPublicAddress } from '@infrastructure/imports/web/public-address';
import { safeFetch } from '@infrastructure/imports/web/safe-fetch';

/**
 * A web import fetches whatever address a stranger pastes. These pin the
 * guard between that and the box's own network: the cloud metadata endpoint
 * that hands out credentials, the admin panel on loopback, the database on the
 * private subnet.
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
    ['the metadata endpoint through the NAT64 prefix', '64:ff9b::169.254.169.254'],
    ['not an address at all', 'example.com'],
  ])('refuses %s', (_why, ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe('safeFetch', () => {
  let server: http.Server;
  let port = 0;
  let hits = 0;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      hits++;
      res.end('secret');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  afterEach(() => jest.restoreAllMocks());

  // DNS rebinding: a public-looking name whose record points inside. The
  // name passes every textual check; only the socket's own lookup can see it.
  it('refuses a public-looking name that resolves to loopback, without connecting', async () => {
    jest.spyOn(dns, 'lookup').mockImplementation(((_host: string, _opts: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: '127.0.0.1', family: 4 }])) as unknown as typeof dns.lookup);
    const before = hits;

    const r = await safeFetch(`http://recipes.example-rebind.com:80/`, { maxBytes: 1000, accept: '*/*' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.import.page_unreachable');
    expect(hits).toBe(before);
    expect(port).toBeGreaterThan(0);
  });

  it('refuses a raw IP address before any lookup', async () => {
    const r = await safeFetch(`http://127.0.0.1:${String(port)}/`, { maxBytes: 1000, accept: '*/*' });
    expect(r.ok).toBe(false);
  });
});
