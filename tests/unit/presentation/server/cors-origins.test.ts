import { corsOptions, allowedOrigins } from '@presentation/server/cors-origins';

/**
 * `cors({ origin: true, credentials: true })` reflected whatever `Origin` the
 * caller sent, which told every site on the internet it was trusted. Measured
 * against production before the change:
 *
 *   Origin: https://saldirgan.example
 *   → access-control-allow-origin: https://saldirgan.example
 *
 * The two failure modes this guards are opposite: allowing an origin that
 * should not be there, and rejecting the mobile app, which sends no `Origin`
 * at all and would simply stop working.
 */

type OriginCheck = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void;

const decide = (origin: string | undefined): boolean => {
  let allowed = false;
  const check = corsOptions().origin as unknown as OriginCheck;
  check(origin, (_err, value) => {
    allowed = value === true;
  });
  return allowed;
};

describe('CORS origin policy', () => {
  it('allows a request with no Origin — the mobile app sends none', () => {
    expect(decide(undefined)).toBe(true);
  });

  it.each(['https://recipely.net', 'https://dev.recipely.net', 'https://app-recipely.web.app'])(
    'allows %s',
    (origin) => {
      expect(decide(origin)).toBe(true);
    },
  );

  it.each([
    'https://saldirgan.example',
    'https://recipely.net.evil.example',
    'http://recipely.net',
  ])('rejects %s', (origin) => {
    expect(decide(origin)).toBe(false);
  });

  it('keeps credentials on, which is why the allowlist has to be exact', () => {
    expect(corsOptions().credentials).toBe(true);
  });

  it('takes extra origins from the environment so a preview host needs no deploy', () => {
    const previous = process.env.CORS_EXTRA_ORIGINS;
    process.env.CORS_EXTRA_ORIGINS = 'https://preview.recipely.net, https://other.example';
    try {
      expect(allowedOrigins()).toContain('https://preview.recipely.net');
      expect(decide('https://other.example')).toBe(true);
    } finally {
      process.env.CORS_EXTRA_ORIGINS = previous;
    }
  });
});
