import type { RecipeMedia } from '@domain/recipes/recipe-media';

/** What removing the cover writes: the new cover, and the gallery rows that were the same photo. */
export interface CoverChange {
  readonly image: string;
  readonly dropMediaIds: readonly string[];
}

/** The first gallery photo that is not `except`, or no cover at all. */
const firstPhotoOtherThan = (media: readonly RecipeMedia[], except: string): string =>
  media.find((m) => m.type === 'image' && m.url !== except)?.url ?? '';

/**
 * Removing the cover removes that PHOTO, wherever it appears.
 *
 * @remarks
 * - **A photo is its URL.** A recipe made with photos has its cover set to
 *   the first one, so the same file is both the cover and `media[0]`. Clearing
 *   only the cover would leave the photo the owner just removed showing in the
 *   gallery — and, for an import, still tripping the copyright gate.
 * - **The next gallery photo is promoted**, so a recipe that still has photos
 *   never shows an empty card. With none left, the cover is empty.
 */
export const coverRemoved = (image: string, media: readonly RecipeMedia[]): CoverChange => ({
  image: firstPhotoOtherThan(media, image),
  dropMediaIds: image.length > 0 ? media.filter((m) => m.url === image).map((m) => m.id) : [],
});

/**
 * The cover once one gallery photo is gone: unchanged, unless that photo WAS
 * the cover, in which case the next one takes its place.
 */
export const coverAfterMediaRemoved = (image: string, media: readonly RecipeMedia[], mediaId: string): string => {
  const removed = media.find((m) => m.id === mediaId);
  if (removed === undefined || removed.url !== image) return image;
  return firstPhotoOtherThan(media.filter((m) => m.id !== mediaId), image);
};

/** A recipe with no cover takes the first photo added to it; one with a cover keeps it. */
export const coverAfterMediaAdded = (image: string, addedUrl: string): string =>
  image.length > 0 ? image : addedUrl;
