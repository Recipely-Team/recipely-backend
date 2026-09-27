import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { LoadedPhoto } from '@infrastructure/ai/photo-focus/photo-image-loader';

/**
 * One provider's half of focus detection: send the photo and the prompt, get
 * the model's raw text back. Parsing is shared, so both providers are held to
 * the same reply shape.
 */
export interface FocusVisionClientInterface {
  readonly provider: string;
  ask(photo: LoadedPhoto, prompt: string): Promise<Result<string, Failure>>;
}
