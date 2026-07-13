import type { TranslationService } from '@application/i18n/translation-service';
import en from '../../src/locales/errors/en.json';

/**
 * A translation service backed by the real `en.json`, so tests exercise the same
 * catalogue the server ships rather than a hand-written stub that could drift.
 *
 * Like i18next, an unknown key is echoed back — which is what `failureToHttp`
 * treats as a translation miss.
 */
export function createTestTranslationService(): TranslationService {
  const dict = en as Record<string, string>;
  return {
    t: (key: string): string => dict[key] ?? key,
    localeFromRequest: (): string => 'en',
  };
}
