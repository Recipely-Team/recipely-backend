import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';
import type { SourcePlatformType } from '@domain/recipes/source-platform';
import type { ImportReading } from '@domain/imports/import-reading';

export interface ImportRecipeRequest {
  readonly url: string;
  readonly locale: string;
  readonly signal?: AbortSignal;
}

export interface ImportRecipeResult {
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
  /** Where the recipe was lifted from — the video platform, or `WEB` for a page. */
  readonly sourcePlatform: SourcePlatformType;
  /**
   * Whether a model wrote the text. Always true for a video, where the model is
   * what turns footage into a recipe; false for a page whose own markup
   * already was one.
   */
  readonly aiWritten: boolean;
  /** What the import read and how sure it was. A page read from its own markup has none. */
  readonly reading?: ImportReading | undefined;
}

/** Turns a link into a recipe: a video through yt-dlp and a model, or a page through its markup. */
export interface RecipeImporterInterface {
  import(req: ImportRecipeRequest): Promise<Result<ImportRecipeResult, Failure>>;
}
