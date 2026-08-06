export interface TranslationService {
  /**
   * @param params Values for `{{placeholders}}` in the phrase.
   *
   * Optional so every existing call is unchanged. It exists because push copy
   * has to name the thing it is about — "Kısır is ready" tells a user which of
   * three queued imports just landed, and building that by concatenating a
   * translated half with an untranslated half is how word order breaks in
   * every language that does not put the subject first.
   */
  t(key: string, locale?: string, params?: Readonly<Record<string, string>>): string;
  localeFromRequest(locales?: string, acceptLanguage?: string): string;
}