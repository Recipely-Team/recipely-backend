import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FocalPoint } from '@domain/recipes/photos/focal-point';

/**
 * Finds the centre of the main dish in a photo.
 *
 * A failure means "no answer" — unreachable model, unreadable image, a reply
 * that is not a point — and every caller treats it as "no focus", which a
 * client renders as a centred crop.
 */
export interface PhotoFocusDetectorInterface {
  detect(imageUrl: string): Promise<Result<FocalPoint, Failure>>;
}
