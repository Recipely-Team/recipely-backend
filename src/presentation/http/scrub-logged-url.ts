/**
 * Paths whose query string carries secrets: Instagram's OAuth `code` and
 * `state` on the callback, and Meta's `hub.verify_token` on the webhook
 * check. They are logged path-only.
 */
const SECRET_QUERY_PATHS = ['/auth/instagram/callback', '/webhooks/instagram'] as const;

const pathOf = (url: string): string => (url.includes('?') ? url.slice(0, url.indexOf('?')) : url);
const isSecretPath = (path: string): boolean => SECRET_QUERY_PATHS.some((secret) => path === secret || path.startsWith(`${secret}/`));

/** A request URL safe for a log line. */
export function scrubLoggedUrl(url: string | undefined): string | undefined {
  if (url === undefined || !url.includes('?')) return url;
  const path = pathOf(url);
  return isSecretPath(path) ? `${path}?[redacted]` : url;
}

/**
 * A pino-http request object safe for a log line: on the secret paths the URL
 * loses its query AND the parsed `query` / `params` copies are dropped — pino
 * logs those separately, so redacting the URL alone still printed the OAuth
 * code and the verify token.
 */
export function scrubLoggedRequest<T extends { url?: string; query?: unknown; params?: unknown }>(req: T): T {
  const url = scrubLoggedUrl(req.url);
  if (req.url === undefined || !isSecretPath(pathOf(req.url))) return { ...req, url };
  const { query: _query, params: _params, ...rest } = req;
  return { ...rest, url } as T;
}
