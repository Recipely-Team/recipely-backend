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
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MAX_DURATION_SECONDS = 90;
const KEYFRAME_COUNT = 6;

// Subprocess buffer — large enough for yt-dlp --dump-json on a reel (~1–5 MB).
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

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

    const userContent: ContentPart[] = [
      { type: 'text', text: textPart },
      ...frames.map((b64) => ({
        type: 'image_url' as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
    ];

    logger.info(
      { model: VISION_MODEL, locale, frameCount: frames.length, hasCaption: caption.length > 0, hasTranscript: transcript.length > 0 },
      'instagram_import_vision_request_start',
    );

    let rawText: string;
    try {
      const completion = await this.client.chat.completions.create(
        {
          model: VISION_MODEL,
          messages: [
            { role: 'system', content: buildImportSystemInstruction(locale) },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        },
        ...(signal !== undefined ? [{ signal }] : []),
      );
      rawText = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      logger.error(
        {
          err,
          errMessage: err instanceof Error ? err.message : String(err),
          errName: err instanceof Error ? err.name : undefined,
          status: (err as { status?: unknown }).status,
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
    });
  }
}
