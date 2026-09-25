/** Every YouTube video id is eleven characters of this alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const SHORT_HOST = 'youtu.be';
/** `/shorts/<id>`, `/live/<id>`, `/embed/<id>` and `/v/<id>` all name the video in the path. */
const PATH_PREFIXES: ReadonlySet<string> = new Set(['shorts', 'live', 'embed', 'v']);
const WATCH_PATH = '/watch';
const WATCH_PARAM = 'v';
const TRAILING_DOT = /\.$/;

/**
 * The video id in a YouTube link, or `null` when the link names no video.
 *
 * @remarks
 * - **Forms read**: `youtube.com/watch?v=<id>` (and `www.` / `m.`),
 *   `youtube.com/shorts/<id>`, `/live/<id>`, `/embed/<id>`, `/v/<id>`, and the
 *   share sheet's `youtu.be/<id>`. Tracking parameters (`si`, `t`, `feature`)
 *   are ignored.
 * - **The id is checked against its alphabet** because it goes into an API
 *   query: a link whose "id" is anything else names no video.
 * - **Which hosts are YouTube is `ImportUrl`'s call**, not this function's; it
 *   only reads the id out of a link already classed as one.
 */
export function youTubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(TRAILING_DOT, '');
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);

  let candidate: string | null | undefined;
  if (host === SHORT_HOST) candidate = segments[0];
  else if (url.pathname.replace(/\/+$/, '') === WATCH_PATH) candidate = url.searchParams.get(WATCH_PARAM);
  else if (segments.length >= 2 && PATH_PREFIXES.has(segments[0]!.toLowerCase())) candidate = segments[1];

  return candidate !== undefined && candidate !== null && VIDEO_ID.test(candidate) ? candidate : null;
}
