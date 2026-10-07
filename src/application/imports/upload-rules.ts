/**
 * What an uploaded photo may be, for every endpoint that reads one with a model.
 *
 * @remarks
 * - **One definition** for the file import and the meal photo parse: a type
 *   the one accepts and the other refuses reads as a bug to the user.
 * - **Held in memory, never stored** by either caller — the byte cap is what
 *   keeps a request from costing the 1 GB box more than one decode.
 */
export const UploadRules = {
  /** JPEG, PNG, WebP and the iPhone's HEIC/HEIF. */
  imageType: /^image\/(?:jpeg|png|webp|heic|heif)$/i,
  maxFileBytes: 10 * 1024 * 1024,
} as const;
