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
  /**
   * The account the post belongs to, without the '@', or `undefined` when the
   * probe did not name one.
   *
   * yt-dlp has returned this on every import since the feature shipped and
   * nothing read it, so a recipe lifted from someone's reel carried no trace of
   * whose reel it was. It rides with the recipe rather than being looked up
   * later because the post is the only place it exists, and an import is the
   * one moment we are standing in front of it.
   */
  readonly sourceHandle?: string | undefined;
}

export interface InstagramRecipeImporterInterface {
  import(req: ImportInstagramRecipeRequest): Promise<Result<ImportInstagramRecipeResult, Failure>>;
}
