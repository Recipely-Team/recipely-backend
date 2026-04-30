export interface TranslationService {
  t(key: string, locale?: string): string;
  localeFromRequest(locales?: string, acceptLanguage?: string): string;
}