/**
 * Every language the app ships in, and so every language a recipe is stored in.
 *
 * @remarks
 * - **The app's 14 catalogues, one for one.** A reader whose language is
 *   missing here reads someone else's: an import is written in its importer's
 *   language, and a Korean reader of a Turkish import used to see Turkish.
 * - **English first** because it is the fallback every read takes
 *   (`localizeRecipe`), so it is the language filled before the rest.
 */
export const RECIPE_LOCALES = ['en', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'id', 'ar', 'hi', 'ja', 'ko', 'zh'] as const;
