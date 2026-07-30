import Groq, { toFile } from 'groq-sdk';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnknownFailure, UnprocessableFailure, ValidationFailure, type Failure } from '@core/failure';
import type {
  IInstagramRecipeImporter,
  ImportInstagramRecipeRequest,
  ImportInstagramRecipeResult,
} from '@application/ai/ports/i-instagram-recipe-importer';
import {
  buildImportSystemInstruction,
  extractJsonBlock,
  ImportRecipeVisionSchema,
} from '@infrastructure/ai/recipe-prompt';
import { logger } from '@presentation/server/logger';

const execFile = promisify(execFileCb);

const PROVIDER = 'groq';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
// llama-4-scout was shut down by Groq on 2026-07-17; qwen3.6-27b is Groq's
// current multimodal model and supports JSON mode.
const VISION_MODEL = 'qwen/qwen3.6-27b';
const MAX_DURATION_SECONDS = 90;

/**
 * Hard ceiling on images per vision request, set by the model: qwen3.6-27b
 * rejects a 4th image with `400 Too many images provided`. That 400 became a
 * 503 at the edge, and it arrived only AFTER the download, audio extraction and
 * every keyframe had already been produced — so the user waited out the whole
 * pipeline to be told the service was unavailable.
 *
 * Enforced twice on purpose: extraction stops here so a 1 OCPU box doesn't burn
 * ffmpeg invocations on frames that can never be sent, and {@link
 * GroqInstagramRecipeImporter.callVision} slices to it again so raising the
 * keyframe count for some future model cannot silently bring the 400 back.
 */
const MAX_VISION_IMAGES = 3;
const KEYFRAME_COUNT = MAX_VISION_IMAGES;

// Subprocess buffer — large enough for yt-dlp --dump-json on a reel (~1–5 MB).
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * True when Groq refused the request for being too big for the account's
 * per-minute token budget — `413`, with a body like:
 *
 *   Request too large … tokens per minute (TPM): Limit 8000, Requested 10459
 *
 * That is a *size* rejection, so the same request retried unchanged fails
 * identically; only a smaller one can succeed. Deliberately narrower than
 * `code: rate_limit_exceeded`, which a plain too-many-requests 429 also carries
 * and which shedding images would not fix.
 */
const isRequestTooLarge = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 413;

export interface GroqInstagramRecipeImporterConfig {
  readonly apiKey: string;
}

export class GroqInstagramRecipeImporter implements IInstagramRecipeImporter {
  private readonly client: Groq;
  private busy = false;

  constructor(private readonly config: GroqInstagramRecipeImporterConfig) {
    this.client = new Groq({ apiKey: config.apiKey });
  }

  async import(req: ImportInstagramRecipeRequest): Promise<Result<ImportInstagramRecipeResult, Failure>> {
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
    req: ImportInstagramRecipeRequest,
    tmpDir: string,
  ): Promise<Result<ImportInstagramRecipeResult, Failure>> {
    // Step 1: probe metadata via yt-dlp.
    const metaResult = await this.probeMeta(req.url);
    if (!metaResult.ok) return metaResult;
    const { description, duration, extractor } = metaResult.value;

    if (!extractor.toLowerCase().includes('instagram')) {
      return fail(new ValidationFailure('errors.import.not_instagram', 'url'));
    }
    if (duration > MAX_DURATION_SECONDS) {
      return fail(new UnprocessableFailure('errors.import.duration_exceeded'));
    }

    // Step 2: download video.
    const videoResult = await this.downloadVideo(req.url, tmpDir);
    if (!videoResult.ok) return videoResult;
    const videoPath = videoResult.value;

    // Step 3: extract audio.
    const audioPath = path.join(tmpDir, 'audio.mp3');
    const audioOk = await this.extractAudio(videoPath, audioPath);

    // Step 4: transcribe (or empty if audio extraction failed).
    let transcript = '';
    if (audioOk) {
      const transcriptResult = await this.transcribe(audioPath, req.locale);
      if (transcriptResult.ok) {
        transcript = transcriptResult.value;
      } else {
        logger.warn(
          { code: transcriptResult.failure.code, messageKey: transcriptResult.failure.messageKey },
          'instagram_import_transcription_failed — continuing without transcript',
        );
      }
    }

    // Step 5: extract keyframes.
    const frames = await this.extractKeyframes(videoPath, tmpDir, duration);

    if (frames.length === 0 && transcript.length === 0 && description.length === 0) {
      return fail(new UnprocessableFailure('errors.import.fetch_failed'));
    }

    // Step 6: vision call.
    return await this.callVision(description, transcript, frames, req.locale, req.signal);
  }

  private async probeMeta(url: string): Promise<
    Result<{ description: string; duration: number; extractor: string }, Failure>
  > {
    let stdout: string;
    try {
      const result = await execFile(
        'yt-dlp',
        ['--no-playlist', '--dump-json', '--socket-timeout', '30', '--', url],
        { maxBuffer: MAX_BUFFER_BYTES },
      );
      stdout = result.stdout;
    } catch (err) {
      logger.error(
        { err, errMessage: err instanceof Error ? err.message : String(err) },
        'instagram_import_probe_failed',
      );
      return fail(new UnprocessableFailure('errors.import.fetch_failed'));
    }

    let meta: unknown;
    try {
      meta = JSON.parse(stdout);
    } catch (err) {
      logger.error({ err }, 'instagram_import_probe_json_parse_failed');
      return fail(new UnprocessableFailure('errors.import.fetch_failed'));
    }

    const m = meta as Record<string, unknown>;
    const description = typeof m['description'] === 'string' ? m['description'] : '';
    const duration = typeof m['duration'] === 'number' ? m['duration'] : 0;
    const extractor = typeof m['extractor'] === 'string' ? m['extractor'] : '';

    return ok({ description, duration, extractor });
  }

  private async downloadVideo(url: string, tmpDir: string): Promise<Result<string, Failure>> {
    const outTemplate = path.join(tmpDir, 'video.%(ext)s');
    try {
      await execFile(
        'yt-dlp',
        ['--no-playlist', '-f', 'worstvideo+bestaudio/worst', '-o', outTemplate, '--socket-timeout', '30', '--', url],
        { maxBuffer: MAX_BUFFER_BYTES },
      );
    } catch (err) {
      logger.error(
        { err, errMessage: err instanceof Error ? err.message : String(err) },
        'instagram_import_download_failed',
      );
      return fail(new UnprocessableFailure('errors.import.fetch_failed'));
    }

    const entries = await fs.readdir(tmpDir);
    const videoFile = entries.find((f) => f.startsWith('video.'));
    if (!videoFile) {
      logger.error({ entries }, 'instagram_import_video_file_not_found');
      return fail(new UnprocessableFailure('errors.import.fetch_failed'));
    }

    return ok(path.join(tmpDir, videoFile));
  }

  // Returns true when audio extraction succeeded; false when the video has no
  // audio track or ffmpeg otherwise fails — the caller proceeds without audio.
  private async extractAudio(videoPath: string, audioPath: string): Promise<boolean> {
    try {
      await execFile('ffmpeg', [
        '-i', videoPath,
        '-vn',
        '-ar', '16000',
        '-ac', '1',
        '-b:a', '64k',
        audioPath,
        '-y',
      ]);
      return true;
    } catch {
      return false;
    }
  }

  private async transcribe(
    audioPath: string,
    locale: string,
  ): Promise<Result<string, Failure>> {
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(audioPath);
    } catch (err) {
      logger.error({ err }, 'instagram_import_audio_read_failed');
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    try {
      const langCode = locale.length === 2 ? locale : undefined;
      const transcription = await this.client.audio.transcriptions.create({
        model: WHISPER_MODEL,
        file: await toFile(buffer, 'audio.mp3', { type: 'audio/mpeg' }),
        ...(langCode !== undefined ? { language: langCode } : {}),
      });
      return ok(transcription.text ?? '');
    } catch (err) {
      logger.error(
        { err, errMessage: err instanceof Error ? err.message : String(err) },
        'instagram_import_transcription_upstream_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }
  }

  // Returns base64-encoded JPEG data for successfully extracted frames.
  // Individual frame failures are tolerated — the overall import continues
  // with however many frames succeeded (min 0).
  private async extractKeyframes(
    videoPath: string,
    tmpDir: string,
    duration: number,
  ): Promise<string[]> {
    const effectiveDuration = Math.max(duration, 1);
    const offsets: number[] = [];
    for (let i = 0; i < KEYFRAME_COUNT; i++) {
      offsets.push((effectiveDuration / (KEYFRAME_COUNT + 1)) * (i + 1));
    }

    const frames: string[] = [];
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      if (offset === undefined) continue;
      const framePath = path.join(tmpDir, `frame_${i}.jpg`);
      try {
        await execFile('ffmpeg', [
          '-ss', String(offset),
          '-i', videoPath,
          '-frames:v', '1',
          '-q:v', '5',
          framePath,
          '-y',
        ]);
        const data = await fs.readFile(framePath);
        frames.push(data.toString('base64'));
      } catch {
        // Individual frame failure is non-fatal.
      }
    }
    return frames;
  }

  private async callVision(
    caption: string,
    transcript: string,
    frames: string[],
    locale: string,
    signal?: AbortSignal,
  ): Promise<Result<ImportInstagramRecipeResult, Failure>> {
    const textPart = [
      caption.length > 0 ? `Caption:\n${caption}` : '',
      transcript.length > 0 ? `Transcript:\n${transcript}` : '',
      'Extract the cooking recipe from the caption, transcript, and video frames above.',
    ]
      .filter(Boolean)
      .join('\n\n');

    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } };

    const available = frames.slice(0, MAX_VISION_IMAGES);

    const requestWith = (images: string[]): ContentPart[] => [
      { type: 'text', text: textPart },
      ...images.map((b64) => ({
        type: 'image_url' as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
    ];

    let rawText: string | undefined;
    let lastError: unknown;

    // Drop one image at a time until the request fits the account's token
    // budget, ending with a text-only attempt. Groq prices an image at a flat
    // per-image rate — measured identical for 1080p, 512px and 384px frames —
    // so shrinking the JPEGs buys nothing here and only the COUNT can give.
    // A fixed count can't be right either: the token total also carries the
    // caption and the transcript, which vary per reel, so the fit is
    // discovered per request rather than guessed at compile time.
    for (let attempt = available.length; attempt >= 0; attempt--) {
      const images = available.slice(0, attempt);

      logger.info(
        {
          model: VISION_MODEL,
          locale,
          frameCount: images.length,
          hasCaption: caption.length > 0,
          hasTranscript: transcript.length > 0,
        },
        'instagram_import_vision_request_start',
      );

      try {
        const completion = await this.client.chat.completions.create(
          {
            model: VISION_MODEL,
            messages: [
              { role: 'system', content: buildImportSystemInstruction(locale) },
              { role: 'user', content: requestWith(images) },
            ],
            response_format: { type: 'json_object' },
            // qwen3.6 is a reasoning model, and left to itself it spends the
            // ENTIRE completion budget thinking and never emits the answer —
            // measured: 2048 completion tokens, 0 characters of content. In
            // json_object mode Groq then rejects the empty result with
            // `400 json_validate_failed` and an empty `failed_generation`,
            // which is what an import looked like from the app: a two-minute
            // wait ending in 503. Turning thinking off produced valid JSON in
            // 599 tokens. Raising max_tokens instead does not work — the extra
            // reservation runs straight into the account's 8000 TPM ceiling.
            reasoning_effort: 'none',
            temperature: 0.3,
          },
          ...(signal !== undefined ? [{ signal }] : []),
        );
        rawText = completion.choices[0]?.message?.content ?? '';
        break;
      } catch (err) {
        lastError = err;
        if (attempt > 0 && isRequestTooLarge(err)) {
          logger.warn(
            { model: VISION_MODEL, frameCount: images.length, nextFrameCount: attempt - 1 },
            'instagram_import_vision_request_too_large_retrying',
          );
          continue;
        }
        break;
      }
    }

    if (rawText === undefined) {
      logger.error(
        {
          err: lastError,
          errMessage: lastError instanceof Error ? lastError.message : String(lastError),
          errName: lastError instanceof Error ? lastError.name : undefined,
          status: (lastError as { status?: unknown } | undefined)?.status,
          model: VISION_MODEL,
        },
        'instagram_import_vision_request_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error({ err, rawText: rawText.slice(0, 500) }, 'instagram_import_vision_json_parse_failed');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    // Check the no-recipe signal BEFORE full schema validation. The prompt
    // instructs the model to respond with bare {"isRecipe": false} for
    // non-recipe content — that minimal object fails the full recipe schema,
    // so we must short-circuit here to surface the correct error code.
    const isRecipeFlag = (parsedJson as Record<string, unknown>)['isRecipe'];
    if (isRecipeFlag === false) {
      return fail(new UnprocessableFailure('errors.import.no_recipe_found'));
    }

    const validated = ImportRecipeVisionSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error({ issues: validated.error.issues }, 'instagram_import_vision_schema_mismatch');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    return ok({
      recipe: validated.data,
      modelUsed: VISION_MODEL,
      provider: PROVIDER,
      // The LAST keyframe, i.e. the latest point in the clip we sampled. A
      // cooking reel builds towards the finished dish, so the later the frame
      // the likelier it shows food worth putting on a card. Free: these frames
      // were already extracted for the vision call, and on a 1 OCPU box that
      // matters — the import measured 119 s against a 120 s timeout, with no
      // room for another ffmpeg pass.
      coverFrameJpegBase64: frames.at(-1) ?? null,
    });
  }
}
