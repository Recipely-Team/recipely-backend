import { resolveFixedRegistrationCode } from '@infrastructure/config/fixed-registration-code';
import type { Env } from '@infrastructure/config/env';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'production',
    PORT: 3000,
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    JWT_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: 10,
    COOKIE_SECURE: false,
    API_AES_KEY: 'a'.repeat(64),
    AI_PROVIDER: 'groq',
    GROQ_MODEL_NAME: 'openai/gpt-oss-120b',
    FIREBASE_PROJECT_ID: 'demo',
    ...overrides,
  } as Env;
}

describe('resolveFixedRegistrationCode', () => {
  it('returns null when no fixed code is configured', () => {
    expect(resolveFixedRegistrationCode(makeEnv({ BASE_URL: 'https://dev-api.recipely.net' }))).toBeNull();
  });

  it('returns the code on a non-production host', () => {
    const env = makeEnv({ DEV_FIXED_REGISTRATION_CODE: '202020', BASE_URL: 'https://dev-api.recipely.net' });
    expect(resolveFixedRegistrationCode(env)).toBe('202020');
  });

  it('returns the code for local development', () => {
    const env = makeEnv({ DEV_FIXED_REGISTRATION_CODE: '202020', BASE_URL: 'http://localhost:3000' });
    expect(resolveFixedRegistrationCode(env)).toBe('202020');
  });

  // The gate has to hold even though the dev box also runs NODE_ENV=production,
  // so NODE_ENV can never be what decides this.
  it.each([
    ['production api', 'https://api.recipely.net'],
    ['production api with a path', 'https://api.recipely.net/uploads'],
    ['production site', 'https://recipely.net'],
    // Default-deny: everything below is unrecognised rather than known-bad,
    // and must be refused all the same.
    ['a trailing-dot production host', 'https://api.recipely.net.'],
    ['a bare IP, which this deployment has been misconfigured to before', 'http://144.24.239.155:3000'],
    ['an unknown environment', 'https://staging.recipely.net'],
    ['a lookalike domain', 'https://dev-api.recipely.net.evil.com'],
  ])('refuses the code when BASE_URL is %s', (_label, baseUrl) => {
    const env = makeEnv({ DEV_FIXED_REGISTRATION_CODE: '202020', BASE_URL: baseUrl });
    expect(resolveFixedRegistrationCode(env)).toBeNull();
  });

  it('accepts a trailing dot on a known dev host, since DNS treats it as equivalent', () => {
    const env = makeEnv({ DEV_FIXED_REGISTRATION_CODE: '202020', BASE_URL: 'https://dev-api.recipely.net.' });
    expect(resolveFixedRegistrationCode(env)).toBe('202020');
  });

  it('refuses the code when only APP_BASE_URL points at production', () => {
    const env = makeEnv({
      DEV_FIXED_REGISTRATION_CODE: '202020',
      BASE_URL: 'https://dev-api.recipely.net',
      APP_BASE_URL: 'https://recipely.net',
    });
    expect(resolveFixedRegistrationCode(env)).toBeNull();
  });

  it('refuses the code when BASE_URL is unset, since that proves nothing about where we run', () => {
    expect(resolveFixedRegistrationCode(makeEnv({ DEV_FIXED_REGISTRATION_CODE: '202020' }))).toBeNull();
  });

  it('refuses the code when BASE_URL is unparseable rather than assuming it is safe', () => {
    const env = makeEnv({ DEV_FIXED_REGISTRATION_CODE: '202020', BASE_URL: 'not-a-url' });
    expect(resolveFixedRegistrationCode(env)).toBeNull();
  });
});
