/** The app's own deep-link schemes (production and dev builds). */
const APP_SCHEMES: ReadonlySet<string> = new Set(['recipely:', 'recipely-dev:']);
/** Recipely's web origins — compared as exact hosts, never as prefixes. */
const WEB_HOSTS: ReadonlySet<string> = new Set(['recipely.net', 'www.recipely.net', 'dev.recipely.net']);
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/**
 * **Where a finished connect may send the browser back to**: the app's deep
 * links, Recipely's web origins over https, and — outside production only —
 * a local dev server over http.
 *
 * @remarks
 * - The link is PARSED and its protocol and host compared exactly. A prefix
 *   test let `http://localhost:@evil.com/` (userinfo trick) and
 *   `https://recipely.net.evil.com/` through: an open redirect on our own
 *   callback, handing a phishing page our domain and the connect outcome.
 * - Anything carrying a username or password is refused outright.
 */
export function isAllowedReturnTo(raw: string, allowLocalhost: boolean): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '') return false;
  if (APP_SCHEMES.has(url.protocol)) return true;
  if (url.protocol === 'https:') return WEB_HOSTS.has(url.hostname) && url.port === '';
  return allowLocalhost && url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
}

/** `returnTo` with the outcome appended as query parameters. */
export function withOutcome(returnTo: string, params: Readonly<Record<string, string>>): string {
  const query = new URLSearchParams(params).toString();
  return `${returnTo}${returnTo.includes('?') ? '&' : '?'}${query}`;
}
