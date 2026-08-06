import { loadEnv } from '@infrastructure/config/env';

/**
 * Compose injects `""` for an unset `${WORKER_SHARED_SECRET:-}`, and an empty
 * string is not `undefined` — so `.optional()` alone does not cover it and
 * `.min(32)` rejects it. The symptom that would reach us: the API refuses to
 * boot, on every deployment that simply has no workers configured, with a
 * validation error about a feature that deployment is not using.
 *
 * The same trap already bit this repo once with COOKIE_SECURE, where the
 * Compose value silently overrode the schema default.
 */

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  API_AES_KEY: 'a'.repeat(64),
  FIREBASE_PROJECT_ID: 'demo',
};

const withEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => {
  const saved = process.env;
  process.env = { ...BASE, ...extra } as NodeJS.ProcessEnv;
  return saved;
};

describe('WORKER_SHARED_SECRET', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
  });

  it('treats the empty string Compose injects as "no workers", not as invalid', () => {
    withEnv({ WORKER_SHARED_SECRET: '' });

    expect(loadEnv().WORKER_SHARED_SECRET).toBeUndefined();
  });

  it('treats a missing variable the same way', () => {
    withEnv({});

    expect(loadEnv().WORKER_SHARED_SECRET).toBeUndefined();
  });

  it('accepts a real secret', () => {
    const secret = 's'.repeat(48);
    withEnv({ WORKER_SHARED_SECRET: secret });

    expect(loadEnv().WORKER_SHARED_SECRET).toBe(secret);
  });

  // A short secret is worse than none: it mounts the endpoints AND is
  // guessable, so it must fail loudly rather than be silently ignored.
  it('refuses a secret too short to be worth having', () => {
    withEnv({ WORKER_SHARED_SECRET: 'short' });

    expect(() => loadEnv()).toThrow();
  });
});
