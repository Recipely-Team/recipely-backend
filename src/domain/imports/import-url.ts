import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { SourcePlatform, type SourcePlatformType } from '@domain/recipes/source-platform';

/**
 * Hosts whose links go to yt-dlp, and the platform each one is.
 *
 * @remarks
 * This allowlist is the whole of the guard in front of yt-dlp, which will
 * happily fetch `http://169.254.169.254/` (the cloud metadata endpoint) or
 * anything else on the box's network. Only a host listed here is ever handed
 * to it — every other link is a web page, and a web page is fetched through
 * the address-checking fetcher instead, never through yt-dlp.
 */
const VIDEO_HOSTS: ReadonlyMap<string, SourcePlatformType> = new Map([
  ['instagram.com', SourcePlatform.Instagram],
  ['www.instagram.com', SourcePlatform.Instagram],
  ['tiktok.com', SourcePlatform.TikTok],
  ['www.tiktok.com', SourcePlatform.TikTok],
  ['m.tiktok.com', SourcePlatform.TikTok],
  // The share sheet's short links; yt-dlp follows them to the video.
  ['vm.tiktok.com', SourcePlatform.TikTok],
  ['vt.tiktok.com', SourcePlatform.TikTok],
  ['facebook.com', SourcePlatform.Facebook],
  ['www.facebook.com', SourcePlatform.Facebook],
  ['m.facebook.com', SourcePlatform.Facebook],
  ['web.facebook.com', SourcePlatform.Facebook],
  ['fb.watch', SourcePlatform.Facebook],
]);

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
/** A URL's `port` is '' for the scheme's default; an explicit 80/443 is the same door. */
const WEB_PORTS: ReadonlySet<string> = new Set(['', '80', '443']);
const MAX_URL_LENGTH = 2048;
const TRAILING_DOT = /\.$/;
const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'] as const;

const invalid = (): Result<never, ValidationFailure> =>
  fail(new ValidationFailure('errors.import.invalid_url', 'url'));

/**
 * A link an import may be run against: a post on a video platform, or a web
 * page that might carry a recipe.
 *
 * @remarks
 * - **Why a value object.** The rules — parses, is http(s), which platform —
 *   were needed by the synchronous import and again by the enqueue path.
 *   Validated in two places is validated in one place too few: the second copy
 *   is the one that drifts (Evans 2003 p.71).
 * - **A web page is refused here only for what the text alone gives away**:
 *   an IP literal, a non-web port, a local-network name, credentials in the
 *   URL. What a public-looking name RESOLVES to is the fetcher's to check, at
 *   the moment of connecting — a check made here would be answered by DNS once
 *   and trusted forever.
 * - **Trimmed at the boundary.** The stored value is the trimmed one, so a
 *   pasted link with a trailing newline enqueues and re-runs identically.
 */
export class ImportUrl {
  private constructor(
    private readonly value: string,
    readonly platform: SourcePlatformType,
    readonly host: string,
  ) {}

  static create(raw: string): Result<ImportUrl, ValidationFailure> {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return invalid();

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return invalid();
    }

    if (!WEB_PROTOCOLS.has(parsed.protocol)) return invalid();
    if (parsed.username !== '' || parsed.password !== '') return invalid();

    if (!WEB_PORTS.has(parsed.port)) return invalid();

    // `localhost.` and `router.local.` are the same names with a trailing dot.
    const host = parsed.hostname.toLowerCase().replace(TRAILING_DOT, '');
    const video = VIDEO_HOSTS.get(host);
    if (video !== undefined) return ok(new ImportUrl(trimmed, video, host));

    if (IPV4_LITERAL.test(host) || host.startsWith('[') || host.includes(':')) return invalid();
    if (!host.includes('.') || host === 'localhost') return invalid();
    if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return invalid();

    return ok(new ImportUrl(trimmed, SourcePlatform.Web, host));
  }

  /** True when the link is a post yt-dlp may fetch; false for a web page. */
  get isVideo(): boolean {
    return this.platform !== SourcePlatform.Web;
  }

  toString(): string {
    return this.value;
  }
}
