import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ImportInstagramRecipeResult } from '@application/ai/ports/i-instagram-recipe-importer';

/**
 * The AI half of an import: turn a reel's audio into words, and its words and
 * frames into a recipe.
 *
 * @remarks
 * - **Why this is a seam at all.** Everything else an import does — yt-dlp,
 *   ffmpeg, the temp directory — is identical whichever provider answers, and
 *   it is the expensive half. Putting the seam here means a second provider
 *   costs two API calls, not a second download.
 * - **`frameBudget` belongs to the model, not the pipeline.** How many images
 *   a request may carry is a property of the model that receives them (Groq's
 *   qwen3.6 rejects a 4th outright), and extracting frames that can never be
 *   sent burns ffmpeg on a 1 OCPU box for nothing.
 * - **`canRun` is asked before the pipeline starts.** A provider with no keys
 *   left is not an error to recover from mid-import; it simply is not a
 *   candidate, and the caller should learn that before spending the download.
 */
export interface IImportModel {
  /** Names the provider in logs and in the result. */
  readonly provider: string;
  /** Most images this model will accept in one request. */
  readonly frameBudget: number;
  /** False when the provider holds no usable key. */
  canRun(): boolean;
  /** Words spoken in the reel, or a failure the caller may continue without. */
  transcribe(audioPath: string, locale: string): Promise<Result<string, Failure>>;
  /** The recipe itself, from the caption, the transcript and the frames. */
  extract(
    caption: string,
    transcript: string,
    frames: readonly string[],
    locale: string,
    signal?: AbortSignal,
  ): Promise<Result<ImportInstagramRecipeResult, Failure>>;
}
