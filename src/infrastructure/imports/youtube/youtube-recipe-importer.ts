import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, ValidationFailure, type Failure } from '@core/failure';
import { ImportUrl } from '@domain/imports/import-url';
import { SourcePlatform } from '@domain/recipes/source-platform';
import type {
  ImportRecipeRequest,
  ImportRecipeResult,
  RecipeImporterInterface,
} from '@application/ai/ports/recipe-importer-interface';
import type { ImportModelInterface } from '@infrastructure/ai/import/import-model-interface';
import { safeFetch } from '@infrastructure/imports/web/safe-fetch';
import { fetchYouTubeSnippet } from '@infrastructure/imports/youtube/fetch-youtube-snippet';
import { youTubeVideoId } from '@infrastructure/imports/youtube/youtube-video-id';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/** Below the completion route's 2.8 MB base64 cap once encoded. */
const MAX_THUMBNAIL_BYTES = 2_000_000;
const IMAGE_ACCEPT = 'image/jpeg,image/webp,image/png;q=0.9,image/*;q=0.8';
/** Raster types only: the bytes reach `sharp` on the API box. */
const IMAGE_TYPE = /^image\/(?:jpeg|png|webp)\b/i;
/** A channel's display name, like a Facebook page's: a name, not a handle. */
const MAX_HANDLE_CHARS = 64;
/** Tells the model what it is reading: the import prompt was written for a reel. */
const SOURCE_NOTE =
  "The text below is a YouTube video's title and description, and the image is its thumbnail. There is no transcript.";
const MODEL_NO_RECIPE = 'errors.import.no_recipe_found';
const NO_RECIPE = 'errors.import.no_recipe_in_video_text';

/**
 * Turns a YouTube video into a recipe from what its uploader wrote about it:
 * the title, the description and the thumbnail.
 *
 * @remarks
 * - **Never yt-dlp.** YouTube answers a server's yt-dlp with "Sign in to
 *   confirm you're not a bot", so the video itself is out of reach. The YouTube
 *   Data API is the official door, and it gives the words — which, on a recipe
 *   video, is very often where the ingredients are listed.
 * - **Without a key the job fails honestly**, as `provider_not_configured`: the
 *   key is optional in the worker's config so a box without one still boots
 *   and serves every other platform.
 * - **Providers are tried in order**, the file reader's loop: a provider that
 *   could not answer makes way for the next; "there is no recipe here" is an
 *   answer and ends the search, as `no_recipe_in_video_text` — the words were
 *   read, the recipe was not in them.
 * - **The thumbnail is fetched through the guarded fetcher**, like a web
 *   page's photo. A thumbnail that cannot be fetched costs the cover and the
 *   frame, never the import.
 */
export class YouTubeRecipeImporter implements RecipeImporterInterface {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly models: readonly ImportModelInterface[],
  ) {}

  async import(req: ImportRecipeRequest): Promise<Result<ImportRecipeResult, Failure>> {
    const url = ImportUrl.create(req.url);
    if (!url.ok) return url;
    const videoId = url.value.platform === SourcePlatform.YouTube ? youTubeVideoId(url.value.toString()) : null;
    if (videoId === null) return fail(new ValidationFailure('errors.import.invalid_url', 'url'));

    const usable = this.models.filter((model) => model.canRun());
    if (this.apiKey === undefined || this.apiKey.length === 0 || usable.length === 0) {
      return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
    }

    const snippet = await fetchYouTubeSnippet(videoId, this.apiKey, req.signal);
    if (!snippet.ok) return snippet;
    const { title, description, channelTitle, thumbnailUrl } = snippet.value;

    const thumbnail = await this.thumbnail(thumbnailUrl, req.signal);
    const caption = [SOURCE_NOTE, title, description].filter((part) => part.length > 0).join('\n\n');
    const frames = thumbnail === null ? [] : [thumbnail];
    const handle = Array.from(channelTitle).slice(0, MAX_HANDLE_CHARS).join('').trim();

    let last: Failure | null = null;
    for (const model of usable) {
      const result = await model.extract(caption, '', frames.slice(0, model.frameBudget), req.locale, req.signal);
      if (result.ok) {
        return ok({
          ...result.value,
          coverFrameJpegBase64: thumbnail,
          sourcePlatform: SourcePlatform.YouTube,
          aiWritten: true,
          ...(handle.length > 0 ? { sourceHandle: handle } : {}),
        });
      }
      if (result.failure.messageKey === MODEL_NO_RECIPE) return fail(new UnprocessableFailure(NO_RECIPE));
      logger.warn({ provider: model.provider, messageKey: result.failure.messageKey }, 'youtube_import_provider_failed');
      last = result.failure;
    }
    return fail(last ?? new ServiceUnavailableFailure('errors.ai.upstream_failed'));
  }

  private async thumbnail(imageUrl: string | null, signal: AbortSignal | undefined): Promise<string | null> {
    if (imageUrl === null) return null;
    const image = await safeFetch(imageUrl, { maxBytes: MAX_THUMBNAIL_BYTES, accept: IMAGE_ACCEPT, signal });
    if (!image.ok || !IMAGE_TYPE.test(image.value.contentType)) return null;
    return image.value.body.toString('base64');
  }
}
