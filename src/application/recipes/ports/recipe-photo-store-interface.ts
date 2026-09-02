/**
 * Where a recipe photo is prepared and kept.
 *
 * @remarks
 * - **Two steps, on purpose.** Preparing and storing are separate because the
 *   moderator has to see the file BEFORE it exists at a public URL. A store
 *   that did both in one call would leave a rejected photo already served —
 *   briefly, but served, and at a URL anybody who guessed it could keep.
 * - **The moderator judges what `prepare` returns**, which is the same bytes
 *   `save` writes. Checking the upload and storing a re-encode of it would be
 *   checking a different picture.
 */
export interface RecipePhotoStoreInterface {
  /** Resize and re-encode in memory. Writes nothing. */
  prepare(upload: Buffer): Promise<Buffer>;
  /** Writes the prepared bytes and returns the public URL. */
  save(prepared: Buffer): Promise<string>;
  /** The type `prepare` produces, for the moderator's request. */
  readonly mimeType: string;
}
