import { fingerprintLines } from '@domain/recipes/publishing/content-fingerprint';

/**
 * What a web import looked like the moment it arrived, kept so the copyright
 * gate can tell whether the owner has since made it their own.
 *
 * @remarks
 * - **Recorded once, at import, and never written again.** Editing a recipe
 *   changes its text, not what it was imported as — that is the whole point of
 *   comparing the two.
 * - **`null` everywhere means "no gate"**: a hand-written recipe, a video
 *   import, and every row written before these columns existed.
 */
export interface ImportedFingerprint {
  /** The stored copy of the site's photo, when the import kept one. */
  importedImage?: string | null | undefined;
  importedIngredientsHash?: string | null | undefined;
  importedInstructionsHash?: string | null | undefined;
}

/** The fingerprint a web import is stamped with, from exactly what it arrived as. */
export const fingerprintImport = (
  image: string,
  ingredients: readonly string[],
  instructions: readonly string[],
): ImportedFingerprint => ({
  importedImage: image.length > 0 ? image : null,
  importedIngredientsHash: fingerprintLines(ingredients),
  importedInstructionsHash: fingerprintLines(instructions),
});
