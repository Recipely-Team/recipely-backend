import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PhotoFocusRepositoryInterface } from '@domain/recipes/photos/photo-focus-repository-interface';
import type { PhotoFocusDetectorInterface } from '@application/recipes/ports/photo-focus-detector-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';

/** Failed detections after which a photo is left centred for good. */
export const PHOTO_FOCUS_MAX_ATTEMPTS = 3;

export interface SweepPhotoFocusResult {
  readonly updated: number;
  readonly failed: number;
  /** Whether the batch came back full — there may be more waiting. */
  readonly remaining: boolean;
}

/**
 * Finds the focal point of photos that have none, one bounded batch at a time.
 *
 * @remarks
 * - **Never on a request path.** Detection is an image download plus a vision
 *   call; a save that waited for it would be seconds slower for a nicer crop.
 *   A new photo is stored with no focus and this sweep finds it on its next tick.
 * - **A batch, not a drain** — the same reasoning as the nutrition sweep: this
 *   runs on a timer, and emptying a backlog at every boot would be a burst of
 *   AI calls.
 * - **A failure is counted, not retried forever.** Each failed detection adds
 *   one to the photo's attempt count and the repository stops offering it at
 *   {@link PHOTO_FOCUS_MAX_ATTEMPTS}. Unlike the nutrition sweep's in-memory
 *   exclusion list this survives a restart, and a deploy restarts often.
 */
export class SweepPhotoFocusUseCase {
  constructor(
    private readonly photos: PhotoFocusRepositoryInterface,
    private readonly detector: PhotoFocusDetectorInterface,
    private readonly logger: LoggerInterface,
  ) {}

  async execute(batchSize: number): Promise<Result<SweepPhotoFocusResult, Failure>> {
    const batch = await this.photos.listPending(batchSize, PHOTO_FOCUS_MAX_ATTEMPTS);
    if (!batch.ok) return batch;

    let updated = 0;
    let failed = 0;
    for (const target of batch.value) {
      const detected = await this.detector.detect(target.url);
      if (!detected.ok) {
        this.logger.warn(
          { recipeId: target.recipeId, mediaId: target.mediaId, code: detected.failure.code },
          'photo_focus_detect_failed',
        );
        await this.photos.recordFailure(target);
        failed++;
        continue;
      }

      const written = await this.photos.saveFocus(target, detected.value);
      if (!written.ok) {
        this.logger.warn({ recipeId: target.recipeId, mediaId: target.mediaId }, 'photo_focus_persist_failed');
        failed++;
        continue;
      }
      updated++;
    }

    return ok({ updated, failed, remaining: batch.value.length === batchSize });
  }
}
