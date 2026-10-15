import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fail, ok, type Result } from '@core/result/result';
import {
  ServiceUnavailableFailure,
  UnknownFailure,
  UnprocessableFailure,
  ValidationFailure,
  type Failure,
} from '@core/failure';
import type {
  RecipeImporterInterface,
  ImportRecipeRequest,
  ImportRecipeResult,
} from '@application/ai/ports/recipe-importer-interface';
import type { ImportModelInterface, ModelImportResult } from '@infrastructure/ai/import/import-model-interface';
import { ImportUrl } from '@domain/imports/import-url';
import { SourcePlatform, type SourcePlatformType } from '@domain/recipes/source-platform';
import { ReelMedia } from '@infrastructure/ai/import/reel-media';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/** Instagram's own reel limit; TikTok and Facebook recipe clips sit inside it too. */
const MAX_DURATION_SECONDS = 180;
/** The word yt-dlp's extractor name carries for each video platform. */
const EXTRACTOR_NAME: Partial<Record<SourcePlatformType, string>> = {
  [SourcePlatform.Instagram]: 'instagram',
  [SourcePlatform.TikTok]: 'tiktok',
  [SourcePlatform.Facebook]: 'facebook',
  [SourcePlatform.Pinterest]: 'pinterest',
};

export interface InstagramRecipeImporterConfig {
  /** Tried in order; the first one that can run and answers, wins. */
  readonly models: readonly ImportModelInterface[];
}

/**
 * Turns an Instagram reel into a recipe: download it once, then ask whichever
 * provider is willing.
 *
 * @remarks
 * - **The video is fetched ONCE, whatever answers it.** yt-dlp and ffmpeg are
 *   the expensive half — a 90-second reel measured 119 s against a 120 s
 *   timeout on a 1 OCPU box — so a fallback that re-downloaded would blow the
 *   budget by existing. The provider seam sits after the media, which is why
 *   trying a second one costs two API calls instead of a second import.
 * - **Falling through is for a provider that could not answer, never for an
 *   answer we dislike.** A reel with no recipe in it, or a model that returned
 *   something unparseable, is a verdict — asking a second provider would spend
 *   another quota to be told the same thing, and `no_recipe_found` would turn
 *   into a two-minute wait. Only "this provider is unavailable" moves on.
 * - **The transcript is optional; the extraction is not.** A reel with no
 *   speech, or a spent Whisper quota, still has a caption and frames worth
 *   reading, so a failed transcription is logged and stepped over.
 * - **So is the video.** A photo post has no stream for yt-dlp to fetch, and
 *   `/p/` links have always been accepted — so sharing one queued a job that
 *   spent worker time only to die at the download with a generic "couldn't
 *   fetch". The caption is already in hand by then: the probe reads it before
 *   anything is downloaded, and on many food posts it IS the recipe. A failed
 *   download therefore falls back to a caption-only extraction, and stays fatal
 *   only when there is no caption either — nothing would be left to read.
 * - **One import at a time per process.** ffmpeg and yt-dlp on a 1 OCPU box do
 *   not overlap usefully, and the queue already serialises work per worker.
 */
/**
 * Puts the account onto a successful extraction.
 *
 * The models return the recipe and know nothing about where the video came
 * from, so the handle is merged here rather than threaded through every
 * provider — a field each of them would have to remember to copy is a field one
 * of them will not.
 */
/**
 * The model's answer, finished with what only the importer knows: whose post it
 * was and which platform it came from. A video is always model-written — the
 * model is what turns footage into a recipe.
 */
const finish = (
  result: Result<ModelImportResult, Failure>,
  uploader: string | undefined,
  sourcePlatform: SourcePlatformType,
): Result<ImportRecipeResult, Failure> =>
  result.ok
    ? ok({
        ...result.value,
        sourcePlatform,
        aiWritten: true,
        ...(uploader !== undefined ? { sourceHandle: uploader } : {}),
      })
    : result;

export class InstagramRecipeImporter implements RecipeImporterInterface {
  private busy = false;
  private readonly media = new ReelMedia();

  constructor(private readonly config: InstagramRecipeImporterConfig) {}

  /** The providers this importer will try, in order. For logs and assertions. */
  get providers(): readonly string[] {
    return this.config.models.map((model) => model.provider);
  }

  async import(req: ImportRecipeRequest): Promise<Result<ImportRecipeResult, Failure>> {
    if (this.busy) {
      return fail(new UnprocessableFailure('errors.import.busy'));
    }
    this.busy = true;

    try {
      let tmpDir: string;
      try {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'igimport-'));
      } catch (err) {
        logger.error({ err }, 'instagram_import_tmpdir_create_failed');
        return fail(new UnknownFailure('errors.import.fetch_failed'));
      }

      try {
        return await this.runPipeline(req, tmpDir);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    } finally {
      this.busy = false;
    }
  }

  private async runPipeline(
    req: ImportRecipeRequest,
    tmpDir: string,
  ): Promise<Result<ImportRecipeResult, Failure>> {
    const url = ImportUrl.create(req.url);
    if (!url.ok) return url;
    // Never hand yt-dlp a link the allowlist did not class as a yt-dlp platform
    // — a web page, or YouTube, which has its own importer.
    const platform = url.value.platform;
    const expected = EXTRACTOR_NAME[platform];
    if (expected === undefined) return fail(new ValidationFailure('errors.import.not_instagram', 'url'));

    const usable = this.config.models.filter((model) => model.canRun());
    if (usable.length === 0) {
      return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
    }

    // Step 1: probe metadata via yt-dlp.
    const metaResult = await this.media.probe(req.url);
    if (!metaResult.ok) return metaResult;
    const { description, duration, extractor, uploader } = metaResult.value;

    // yt-dlp must have read it as the platform the link claimed — a redirect
    // to somewhere else is not the video that was asked for.
    if (!extractor.toLowerCase().includes(expected)) {
      return fail(new ValidationFailure('errors.import.not_instagram', 'url'));
    }
    if (duration > MAX_DURATION_SECONDS) {
      return fail(new UnprocessableFailure('errors.import.duration_exceeded'));
    }

    // Step 2: download video — optional, see the "no video" remark on the class.
    const videoResult = await this.media.download(req.url, tmpDir);
    if (!videoResult.ok) {
      if (description.trim().length === 0) return videoResult;
      logger.info(
        { url: req.url, captionLength: description.length },
        'instagram_import_no_video — extracting from the caption alone',
      );
      return finish(await this.extractWith(usable, description, '', [], req), uploader, platform);
    }
    const videoPath = videoResult.value;

    // Step 3: extract audio.
    const audioPath = path.join(tmpDir, 'audio.mp3');
    const audioOk = await this.media.extractAudio(videoPath, audioPath);

    // Step 4: transcribe with the first model willing to.
    const transcript = audioOk ? await this.transcribeWith(usable, audioPath, req.locale) : '';

    // Step 5: extract keyframes — no more than the hungriest model can send,
    // so ffmpeg is never spent on an image that has nowhere to go.
    const frameBudget = Math.max(...usable.map((model) => model.frameBudget));
    const frames = await this.media.extractKeyframes(videoPath, tmpDir, duration, frameBudget);

    if (frames.length === 0 && transcript.length === 0 && description.length === 0) {
      return fail(new UnprocessableFailure('errors.import.fetch_failed'));
    }

    // Step 6: extraction, falling through only on an unavailable provider.
    return finish(await this.extractWith(usable, description, transcript, frames, req), uploader, platform);
  }

  /** The first transcript anyone can produce, or none — never a failure. */
  private async transcribeWith(
    models: readonly ImportModelInterface[],
    audioPath: string,
    locale: string,
  ): Promise<string> {
    for (const model of models) {
      const result = await model.transcribe(audioPath, locale);
      if (result.ok) return result.value;
      logger.warn(
        {
          provider: model.provider,
          code: result.failure.code,
          messageKey: result.failure.messageKey,
        },
        'instagram_import_transcription_failed — continuing',
      );
    }
    return '';
  }

  private async extractWith(
    models: readonly ImportModelInterface[],
    caption: string,
    transcript: string,
    frames: readonly string[],
    req: ImportRecipeRequest,
  ): Promise<Result<ModelImportResult, Failure>> {
    let lastFailure: Failure = new ServiceUnavailableFailure('errors.ai.upstream_failed');

    for (const model of models) {
      const result = await model.extract(caption, transcript, frames, req.locale, req.signal);
      if (result.ok) return result;

      lastFailure = result.failure;
      // Anything other than "this provider could not answer" is the answer.
      if (!(result.failure instanceof ServiceUnavailableFailure)) return result;

      logger.warn(
        { provider: model.provider, messageKey: result.failure.messageKey },
        'instagram_import_provider_unavailable — trying the next one',
      );
    }

    return fail(lastFailure);
  }
}
