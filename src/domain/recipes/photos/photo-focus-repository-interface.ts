import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FocalPoint } from '@domain/recipes/photos/focal-point';
import type { PhotoFocusTarget } from '@domain/recipes/photos/photo-focus-target';

/**
 * The photo-focus sweep's narrow door onto stored photos.
 *
 * @remarks
 * - **Separate from `RecipeRepositoryInterface`** because nothing it does is
 *   about a recipe as a whole: it reads photo URLs and writes two numbers, and
 *   routing that through the recipe aggregate's `update` would delete and
 *   recreate every gallery it touched.
 * - **`listPending` skips any photo that has failed `maxAttempts` times**, so an
 *   unreadable picture stops costing an AI call per sweep.
 */
export interface PhotoFocusRepositoryInterface {
  /** Photos of live recipes with no focus and fewer than `maxAttempts` failures, newest first. */
  listPending(limit: number, maxAttempts: number): Promise<Result<PhotoFocusTarget[], Failure>>;
  /** Stores the focus — only while the photo still has the URL it was detected on. */
  saveFocus(target: PhotoFocusTarget, focus: FocalPoint): Promise<Result<void, Failure>>;
  /** Counts one failed detection against the photo; its focus stays NULL. */
  recordFailure(target: PhotoFocusTarget): Promise<Result<void, Failure>>;
}
