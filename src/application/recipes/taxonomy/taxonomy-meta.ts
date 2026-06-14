/**
 * Display metadata for one taxonomy key: its emoji glyph plus the localized
 * label in each supported language. Emoji is locale-independent; names cover
 * the app's primary languages (en + tr). Any other locale falls back to `en`.
 */
export interface TaxonomyMeta {
  emoji: string;
  en: string;
  tr: string;
}
