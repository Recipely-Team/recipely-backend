import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fail, ok, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const execFile = promisify(execFileCb);

// Subprocess buffer — large enough for yt-dlp --dump-json on a reel (~1–5 MB).
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** What yt-dlp knows about a reel before anything is downloaded. */
interface ReelMetadata {
  description: string;
  duration: number;
  extractor: string;
  /**
   * The account the post belongs to, without the '@'.
   *
   * yt-dlp has returned this in every probe since the import shipped and
   * nothing read it, so a recipe lifted from someone's reel carried no trace of
   * whose reel it was. `uploader_id` is the handle a link is built from;
   * `channel` and `uploader` are its fallbacks, and `uploader` can be a display
   * name rather than a handle, so it is taken last.
   */
  uploader: string | undefined;
}

/** What an account handle looks like on Instagram and TikTok: no spaces, not only digits. */
const HANDLE = /^(?!\d+$)[A-Za-z0-9._]{1,64}$/;

/**
 * The first of these yt-dlp fields that is a usable handle.
 *
 * Platforms disagree on which field holds it: Instagram puts the handle in
 * `uploader_id`, TikTok puts a numeric user id there and the handle in
 * `uploader`, and `channel` is a display name ("Gordon Ramsay") on TikTok. So
 * each is judged by its shape rather than trusted by its name.
 */
export const readUploader = (meta: Record<string, unknown>): string | undefined => {
  for (const field of ['uploader_id', 'uploader', 'channel']) {
    const value = meta[field];
    if (typeof value !== 'string') continue;
    const handle = value.trim().replace(/^@/, '');
    if (HANDLE.test(handle)) return handle;
  }
  return undefined;
};

/**
 * Everything an import does to a video before a model sees it: probe,
 * download, strip the audio, sample keyframes.
 *
 * @remarks
 * - **Provider-agnostic on purpose.** yt-dlp and ffmpeg do not care which model
 *   reads the result, and this is the expensive half — a 90-second reel on a
 *   1 OCPU box measured 119 s against a 120 s timeout. Whoever ends up
 *   extracting the recipe, this runs exactly ONCE per import; a second provider
 *   that re-downloaded the video would blow that budget on its own.
 * - **Partial results are results.** A video with no audio track, or a frame
 *   ffmpeg refuses, does not fail the import: the caller is handed whatever
 *   survived and decides whether it has enough to work with. Only a failed
 *   probe or download is fatal, because those leave nothing at all.
 */
export class ReelMedia {
  /**
   * Reads a reel's metadata without downloading it.
   *
   * Deliberately first: duration and extractor are the two things that can
   * reject an import outright, and finding out after the download would spend
   * the whole budget to learn the clip was never eligible.
   */
  async probe(url: string): Promise<Result<ReelMetadata, Failure>> {
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

    return ok({ description, duration, extractor, uploader: readUploader(m) });
  }

  async download(url: string, tmpDir: string): Promise<Result<string, Failure>> {
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
  async extractAudio(videoPath: string, audioPath: string): Promise<boolean> {
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

  // Returns base64-encoded JPEG data for successfully extracted frames.
  // Individual frame failures are tolerated — the overall import continues
  // with however many frames succeeded (min 0).
  async extractKeyframes(
    videoPath: string,
    tmpDir: string,
    duration: number,
    frameCount: number,
  ): Promise<string[]> {
    const effectiveDuration = Math.max(duration, 1);
    const offsets: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      offsets.push((effectiveDuration / (frameCount + 1)) * (i + 1));
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
}
