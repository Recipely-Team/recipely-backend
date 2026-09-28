import { I18nextTranslationService } from '@infrastructure/i18n/i18next-translation-service';
import { ImportNotificationKeys } from '@application/imports/import-notification-keys';

/**
 * The push an import sends is the only copy the SERVER words — FCM has to
 * render it while the app is closed, so the client cannot translate it later.
 *
 * Two things can go wrong silently, and both reach the user as a notification:
 *
 *   A missing key. i18next returns the key itself, so the user's phone shows
 *   `notifications.import.done.title` as the title and nothing logs a problem.
 *
 *   A missing interpolation. `{{title}}` left unsubstituted ships literal
 *   braces to the notification tray.
 *
 * The catalogue also uses FLAT dotted keys (`"errors.import.invalid_url": ...`)
 * rather than nested objects, which is exactly the case i18next's default
 * key separator does NOT handle by nesting — so "the key resolves at all" is
 * a real question here, not a formality.
 */

const LOCALES = ['en', 'tr', 'de', 'fr', 'es', 'ar'] as const;
const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'YOUTUBE', 'WEB'] as const;
// Every fixed key, plus the per-source body — so a source without copy fails here.
const KEYS: string[] = [
  ...(Object.values(ImportNotificationKeys).filter((k) => typeof k === 'string') as string[]),
  ...PLATFORMS.map((p) => ImportNotificationKeys.doneBodyFor(p)),
];

describe('import notification copy', () => {
  let ts: I18nextTranslationService;

  beforeAll(async () => {
    ts = new I18nextTranslationService();
    await ts.init();
  });

  it.each(LOCALES)('resolves every key in %s', (locale) => {
    for (const key of KEYS) {
      const value = ts.t(key, locale);

      expect(value).not.toBe(key);
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('substitutes the recipe name in %s', (locale) => {
    const body = ts.t(ImportNotificationKeys.doneBody, locale, { title: 'Menemen' });

    expect(body).toContain('Menemen');
    expect(body).not.toContain('{{');
  });

  it('translates rather than falling back to English', () => {
    const en = ts.t(ImportNotificationKeys.doneTitle, 'en');
    const tr = ts.t(ImportNotificationKeys.doneTitle, 'tr');

    expect(tr).not.toBe(en);
  });

  it('still returns something for a locale we do not carry', () => {
    const value = ts.t(ImportNotificationKeys.doneTitle, 'ja');

    expect(value).not.toBe(ImportNotificationKeys.doneTitle);
  });
});
