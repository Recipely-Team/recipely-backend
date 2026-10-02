/**
 * Paths whose query string carries secrets: Instagram's OAuth `code` and
 * `state` on the callback, and Meta's `hub.verify_token` on the webhook
 * check. They are logged path-only.
 */
const SECRET_QUERY_PATHS = ['/auth/instagram/callback', '/webhooks/instagram'] as const;

/** A request URL safe for a log line. */
export function scrubLoggedUrl(url: string | undefined): string | undefined {
  if (url === undefined) return url;
  const query = url.indexOf('?');
  if (query === -1) return url;
  const path = url.slice(0, query);
  return SECRET_QUERY_PATHS.some((secret) => path === secret || path.startsWith(`${secret}/`)) ? `${path}?[redacted]` : url;
}
