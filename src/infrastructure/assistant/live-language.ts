/**
 * The app's locale as the Live API needs to hear it.
 *
 * @remarks
 * The app selects languages by two-letter code (`tr`, `en`, `de`). The Live
 * API's `speechConfig.languageCode` is BCP-47 WITH a region — `tr-TR`, not
 * `tr` — and given a code it does not recognise it does not fail: it stops
 * pinning the language and infers one from the audio instead. A Turkish user
 * was answered in Hindi, and every instruction they gave was transcribed as
 * whatever that guess made of it.
 *
 * Regions are the largest speaking population for each, which is what the
 * model's own examples use.
 */
const REGION_BY_LANGUAGE: Readonly<Record<string, string>> = {
  en: 'en-US',
  tr: 'tr-TR',
  es: 'es-ES',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ru: 'ru-RU',
  id: 'id-ID',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'cmn-CN',
  ar: 'ar-XA',
  hi: 'hi-IN',
};

const FALLBACK = 'en-US';

/**
 * Widens a locale to a tagged one the Live API accepts.
 *
 * Already-tagged input is passed through, so a client that starts sending
 * `tr-TR` needs no change here.
 */
export function toLiveLanguageCode(locale: string): string {
  if (locale.includes('-')) return locale;
  return REGION_BY_LANGUAGE[locale.toLowerCase()] ?? FALLBACK;
}
