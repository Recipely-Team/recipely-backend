import sharp from 'sharp';
import { fail, ok, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import type { MealPhotoPreparerInterface } from '@application/diary/ports/meal-photo-preparer-interface';

/** Enough to tell bread from börek; small enough for every vision model's limit. */
const EDGE = 1024;
const QUALITY = 80;
/** A 20 MP decode is ~80 MB of raw pixels — the most the 1 GB box takes at once. */
const MAX_INPUT_PIXELS = 20_000_000;
const JPEG = 'image/jpeg';

/**
 * Decodes, orients, shrinks and re-encodes a meal photo in memory.
 *
 * @remarks
 * Nothing touches the disk; the buffer is dropped with the request. An image
 * that will not decode is the user's to retake, not an outage.
 */
export class SharpMealPhotoPreparer implements MealPhotoPreparerInterface {
  async prepare(bytes: Buffer): Promise<Result<{ image: Buffer; mimeType: string }, Failure>> {
    try {
      const image = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(EDGE, EDGE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITY })
        .toBuffer();
      return ok({ image, mimeType: JPEG });
    } catch {
      return fail(new UnprocessableFailure('errors.meal_parse.unsupported_photo', 'photo'));
    }
  }
}
