import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

/**
 * Hosts an import is willing to fetch from.
 *
 * @remarks
 * This is the whole of the SSRF guard. The URL reaches yt-dlp, which will
 * happily fetch `http://169.254.169.254/` (the cloud metadata endpoint) or
 * anything else on the box's network, so the check is an allowlist and never a
 * blocklist — a blocklist has to be right about every address that must not be
 * reached, and an allowlist only has to be right about the two that must.
 */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['instagram.com', 'www.instagram.com']);

/**
 * An Instagram link an import may be run against.
 *
 * @remarks
 * - **Why a value object.** The same two rules — parses as a URL, is an
 *   Instagram host — were needed by the synchronous import and again by the
 *   enqueue path. Validated in two places is validated in one place too few:
 *   the second copy is the one that drifts (Evans 2003 p.71).
 * - **Trimmed at the boundary.** The stored value is the trimmed one, so a
 *   pasted link with a trailing newline enqueues and re-runs identically.
 */
export class InstagramUrl {
  private constructor(private readonly value: string) {}

  static create(raw: string): Result<InstagramUrl, ValidationFailure> {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return fail(new ValidationFailure('errors.import.invalid_url', 'url'));
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return fail(new ValidationFailure('errors.import.invalid_url', 'url'));
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return fail(new ValidationFailure('errors.import.not_instagram', 'url'));
    }

    return ok(new InstagramUrl(trimmed));
  }

  toString(): string {
    return this.value;
  }
}
