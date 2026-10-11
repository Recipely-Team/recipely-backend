import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FridgePhoto } from '@application/fridge/ports/fridge-scanner-interface';

/**
 * One provider's raw answer to a fridge prompt — the vision model when photos
 * ride along, the text model otherwise.
 *
 * @remarks
 * Reading and validating the answer is the scanner's and the idea
 * generator's job, so the rule for a garbled reply is written once.
 */
export interface FridgeModelInterface {
  readonly provider: string;
  canRun(): boolean;
  complete(prompt: string, photos: readonly FridgePhoto[]): Promise<Result<string, Failure>>;
}
