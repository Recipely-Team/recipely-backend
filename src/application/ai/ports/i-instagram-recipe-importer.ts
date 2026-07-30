import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';

export interface ImportInstagramRecipeRequest {
  readonly url: string;
  readonly locale: string;
  readonly signal?: AbortSignal;
}

export interface ImportInstagramRecipeResult {
  readonly recipe: GeneratedRecipeDto;
  readonly modelUsed: string;
  readonly provider: string;
  /**
   * A JPEG frame from the video, base64-encoded, to use as the recipe's cover —
   * or `null` when ffmpeg produced no usable frame.
   *
   * Deliberately raw bytes rather than a URL: deciding where a cover is stored
   * and what it is named is not an importer's business, and an importer that
   * wrote files would leave them behind on every failure after that point.
   */
  readonly coverFrameJpegBase64: string | null;
}

export interface IInstagramRecipeImporter {
  import(req: ImportInstagramRecipeRequest): Promise<Result<ImportInstagramRecipeResult, Failure>>;
}
