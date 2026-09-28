import { z } from 'zod';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
/** The metadata answer is a few kilobytes; ten seconds is a stalled connection, not a slow one. */
const REQUEST_TIMEOUT_MS = 10_000;
const HTTP_NOT_FOUND = 404;
const REDACTED = '[redacted]';
/** Largest first. `default` and `medium` are too small to be a cover. */
const THUMBNAIL_ORDER = ['maxres', 'standard', 'high'] as const;

const Thumbnail = z.object({ url: z.string().url() });
const VideosResponse = z.object({
  items: z.array(
    z.object({
      snippet: z.object({
        title: z.string().default(''),
        description: z.string().default(''),
        channelTitle: z.string().default(''),
        thumbnails: z.record(z.string(), Thumbnail).default({}),
      }),
    }),
  ).default([]),
});
const ErrorResponse = z.object({
  error: z.object({ errors: z.array(z.object({ reason: z.string() })).default([]) }),
});

interface YouTubeSnippet {
  readonly title: string;
  readonly description: string;
  readonly channelTitle: string;
  readonly thumbnailUrl: string | null;
}

/** Removes the key from any text that might end up in a log line or an error. */
const redact = (text: string, apiKey: string): string => text.split(apiKey).join(REDACTED);

/**
 * A video's title, description, channel and best thumbnail, from the YouTube
 * Data API v3 (`videos.list`, `part=snippet`).
 *
 * @remarks
 * - **The key never leaves this function in the clear.** It is in the request
 *   URL and nowhere else; the URL is never logged, and every string that is —
 *   an API error reason, a network error's message — is passed through
 *   `redact` first, so a library that echoes its request cannot leak it.
 * - **A video that is not there is a verdict about the link**: a 404, or the
 *   API's own answer for a private or deleted id — an empty `items` list —
 *   is `fetch_failed`, the same thing a yt-dlp import says.
 * - **Everything else is an outage on our side**: a spent daily quota (403
 *   `quotaExceeded`), a key the API refuses (400/403), a 5xx or a timeout is
 *   `upstream_failed`, which says "try again later" rather than "your link is
 *   wrong".
 */
export async function fetchYouTubeSnippet(
  videoId: string,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<Result<YouTubeSnippet, Failure>> {
  const query = new URLSearchParams({ part: 'snippet', id: videoId, key: apiKey });
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${VIDEOS_ENDPOINT}?${query.toString()}`, {
      signal: signal !== undefined ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    const reason = redact(err instanceof Error ? err.message : String(err), apiKey);
    logger.warn({ videoId, reason }, 'youtube_import_request_failed');
    return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = ErrorResponse.safeParse(body);
    const reason = parsedError.success ? redact(parsedError.data.error.errors[0]?.reason ?? '', apiKey) : '';
    logger.warn({ videoId, status: response.status, reason }, 'youtube_import_api_refused');
    return response.status === HTTP_NOT_FOUND
      ? fail(new UnprocessableFailure('errors.import.fetch_failed'))
      : fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
  }

  const parsed = VideosResponse.safeParse(body);
  if (!parsed.success) {
    logger.warn({ videoId }, 'youtube_import_unreadable_answer');
    return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
  }
  const snippet = parsed.data.items[0]?.snippet;
  if (snippet === undefined) return fail(new UnprocessableFailure('errors.import.fetch_failed'));

  const thumbnail = THUMBNAIL_ORDER.map((size) => snippet.thumbnails[size]).find((t) => t !== undefined);
  return ok({
    title: snippet.title.trim(),
    description: snippet.description.trim(),
    channelTitle: snippet.channelTitle.trim(),
    thumbnailUrl: thumbnail?.url ?? null,
  });
}
