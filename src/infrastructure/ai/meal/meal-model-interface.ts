import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/**
 * One provider's raw answer to the meal prompt — text model for words,
 * vision model when a photo rides along.
 *
 * @remarks
 * Reading and validating the answer is {@link ModelMealParser}'s job, so the
 * rule for a garbled reply is written once for every provider.
 */
export interface MealModelInterface {
  readonly provider: string;
  canRun(): boolean;
  complete(prompt: string, photo?: { readonly image: Buffer; readonly mimeType: string }): Promise<Result<string, Failure>>;
}
