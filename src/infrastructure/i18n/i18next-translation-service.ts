import i18next from 'i18next';
import i18nextFsBackend from 'i18next-fs-backend';
import { TranslationService } from '@application/i18n/translation-service';

/**
 * Locales this API will ANSWER in.
 *
 * @remarks
 * Deliberately narrower than `src/locales/errors/`: a catalogue exists for
 * every language the app has been translated into, but the app only lets a user
 * SELECT the ones whose rendering has been verified (Latin and Cyrillic today —
 * see `preview-locales.ts` in the app). Answering in a language the app cannot
 * display would put, say, Devanagari error text under an English interface.
 *
 * `ar`, `hi`, `zh`, `ja` and `ko` are translated and sitting in this folder,
 * waiting for the same check that lets the app offer them. Adding one here and
 * there is the whole job.
 */
const SUPPORTED_LOCALES = ['en', 'tr', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'id'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

function resolveLocale(locale?: string, acceptLanguage?: string): SupportedLocale {
  if (locale && SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    return locale as SupportedLocale;
  }
  if (acceptLanguage) {
    const parts = acceptLanguage.split(',')[0]?.trim().split('-');
    const header = parts?.[0] ?? '';
    if (header && SUPPORTED_LOCALES.includes(header as SupportedLocale)) {
      return header as SupportedLocale;
    }
  }
  return 'en';
}

export class I18nextTranslationService implements TranslationService {
  private readonly i18n: typeof i18next;

  constructor() {
    this.i18n = i18next;
    this.i18n.use(i18nextFsBackend);
  }

  async init(): Promise<void> {
    await this.i18n.init({
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: [...SUPPORTED_LOCALES],
      preload: [...SUPPORTED_LOCALES],
      backend: {
        loadPath: `${process.cwd()}/src/locales/errors/{{lng}}.json`,
      },
    });
  }

  t(key: string, locale?: string, params?: Readonly<Record<string, string>>): string {
    const lng = locale ?? 'en';
    return this.i18n.t(key, { lng, ...params }) ?? key;
  }

  localeFromRequest(locales?: string, acceptLanguage?: string): string {
    return resolveLocale(locales, acceptLanguage);
  }
}