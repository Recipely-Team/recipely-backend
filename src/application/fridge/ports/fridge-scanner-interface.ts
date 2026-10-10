import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IngredientConfidenceType } from '@domain/fridge/ingredient-confidence';

/** One prepared (bounded JPEG) photo, held in memory only. */
export interface FridgePhoto {
  readonly image: Buffer;
  readonly mimeType: string;
}

/** One ingredient the model saw, before it is cleaned, deduplicated and moderated. */
export interface DetectedIngredient {
  readonly name: string;
  readonly confidence: IngredientConfidenceType;
}

/**
 * Reads the ingredients visible in up to three fridge or pantry photos.
 *
 * @remarks
 * - **Never logs the photos**; they leave this call only to the model.
 * - **A vision model only**: a text model answers confidently about a picture
 *   it never saw.
 */
export interface FridgeScannerInterface {
  scan(req: { readonly photos: readonly FridgePhoto[]; readonly locale: string }): Promise<Result<readonly DetectedIngredient[], Failure>>;
}
