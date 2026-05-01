import i18next from 'i18next';
import i18nextFsBackend from 'i18next-fs-backend';
import { TranslationService } from '@application/i18n/translation-service';

const SUPPORTED_LOCALES = ['en', 'tr', 'de', 'fr', 'es', 'ar'] as const;
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

  t(key: string, locale?: string): string {
    const lng = locale ?? 'en';
    return this.i18n.t(key, { lng }) ?? key;
  }

  localeFromRequest(locales?: string, acceptLanguage?: string): string {
    return resolveLocale(locales, acceptLanguage);
  }
}