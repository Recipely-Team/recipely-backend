import { loadEnv } from '@infrastructure/config/env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(40),
  API_AES_KEY: 'a'.repeat(64),
  FIREBASE_PROJECT_ID: 'p',
};

describe('Instagram configuration', () => {
  it('is optional as a whole', () => {
    const env = loadEnv(base);
    expect([env.INSTAGRAM_APP_ID, env.INSTAGRAM_REDIRECT_URI]).toEqual([undefined, undefined]);
  });

  it('reads empty Compose values as absent', () => {
    expect(loadEnv({ ...base, INSTAGRAM_APP_ID: '', INSTAGRAM_APP_SECRET: '', INSTAGRAM_REDIRECT_URI: '' }).INSTAGRAM_APP_ID).toBeUndefined();
  });

  it('polls comments unless switched off', () => {
    expect(loadEnv(base).INSTAGRAM_COMMENT_POLLING).toBe(true);
    expect(loadEnv({ ...base, INSTAGRAM_COMMENT_POLLING: '' }).INSTAGRAM_COMMENT_POLLING).toBe(true);
    expect(loadEnv({ ...base, INSTAGRAM_COMMENT_POLLING: 'false' }).INSTAGRAM_COMMENT_POLLING).toBe(false);
  });

  // A default would have pointed production logins at dev's callback.
  it('refuses to boot with an app id but no redirect URI', () => {
    expect(() => loadEnv({ ...base, INSTAGRAM_APP_ID: '123', INSTAGRAM_APP_SECRET: 's' })).toThrow(/INSTAGRAM_REDIRECT_URI/);
    expect(loadEnv({ ...base, INSTAGRAM_APP_ID: '123', INSTAGRAM_APP_SECRET: 's', INSTAGRAM_REDIRECT_URI: 'https://api.recipely.net/auth/instagram/callback' }).INSTAGRAM_REDIRECT_URI)
      .toBe('https://api.recipely.net/auth/instagram/callback');
  });
});
