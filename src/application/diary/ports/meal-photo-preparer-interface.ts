import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/**
 * Decodes an uploaded meal photo and re-encodes it as a bounded JPEG, in memory.
 *
 * @remarks
 * The moderator and the parser see the same prepared bytes; neither is ever
 * written to disk.
 */
export interface MealPhotoPreparerInterface {
  prepare(bytes: Buffer): Promise<Result<{ readonly image: Buffer; readonly mimeType: string }, Failure>>;
}
