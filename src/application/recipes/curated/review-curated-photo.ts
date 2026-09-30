import { CuratedGate } from '@application/recipes/curated/curated-gate';
import type { ImageDimensionsReaderInterface } from '@application/recipes/ports/image-dimensions-reader-interface';

/** The smallest short side a curated cover may have, in pixels. */
export const CURATED_PHOTO_MIN_SHORT_SIDE = 1200;

/**
 * The photo gate that can be checked by machine: the file is a readable image
 * whose short side is at least {@link CURATED_PHOTO_MIN_SHORT_SIDE}. Read from
 * the source bytes, before the store resizes anything. The rest of the photo
 * gates (no watermark, the right dish, plated) are checked by eye.
 */
export const reviewCuratedPhoto = async (photo: Buffer, reader: ImageDimensionsReaderInterface): Promise<string[]> => {
  const size = await reader.read(photo);
  if (size === null) return [`${CuratedGate.Photo}: the file is not a readable image`];
  const shortSide = Math.min(size.width, size.height);
  if (shortSide >= CURATED_PHOTO_MIN_SHORT_SIDE) return [];
  return [`${CuratedGate.Photo}: ${size.width}×${size.height} px — the short side must be at least ${CURATED_PHOTO_MIN_SHORT_SIDE} px`];
};
