import { loadEnv } from '@infrastructure/config/env';

/**
 * ADMIN_ROOT_PATH + ADMIN_HOST control where the AdminJS panel is served.
 *
 * The load-bearing trap is the same one WORKER_SHARED_SECRET and COOKIE_SECURE
 * hit: Compose injects `""` for an unset `${ADMIN_HOST:-}`, and `""` is not
 * `undefined`. If that empty string survived into ADMIN_HOST, the app would gate
 * the panel to a hostname no request ever carries and lock it out on every host.
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

describe('admin panel location env', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
  });

  it('defaults ADMIN_ROOT_PATH to /admin and ADMIN_HOST to undefined', () => {
    withEnv({});
    const env = loadEnv();
    expect(env.ADMIN_ROOT_PATH).toBe('/admin');
    expect(env.ADMIN_HOST).toBeUndefined();
  });

  it('treats the empty string Compose injects for ADMIN_HOST as unset', () => {
    withEnv({ ADMIN_HOST: '' });
    expect(loadEnv().ADMIN_HOST).toBeUndefined();
  });

  it('accepts a root path and host for the dedicated-host layout', () => {
    withEnv({ ADMIN_ROOT_PATH: '/', ADMIN_HOST: 'admin.recipely.net' });
    const env = loadEnv();
    expect(env.ADMIN_ROOT_PATH).toBe('/');
    expect(env.ADMIN_HOST).toBe('admin.recipely.net');
  });

  it('rejects a root path that is not absolute', () => {
    withEnv({ ADMIN_ROOT_PATH: 'admin' });
    expect(() => loadEnv()).toThrow();
  });
});
