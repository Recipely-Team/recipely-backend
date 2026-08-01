import type { Request } from 'express';

/**
 * The header Cloudflare sets to the real client address.
 *
 * Cloudflare overwrites it on every proxied request, so a value a client tries
 * to send itself is discarded before the origin sees it.
 */
const CF_CONNECTING_IP = 'cf-connecting-ip';

/**
 * The address a request actually came from.
 *
 * @remarks
 * - **Why not `req.ip`.** Two proxies sit in front of the app — Cloudflare, then
 *   nginx — so the socket address is nginx's. Everything keyed on it (rate
 *   limits, abuse counters, logs) collapses every client onto one value.
 * - **Why this header can be trusted.** Only because the origin accepts
 *   connections from Cloudflare alone. Cloudflare rewrites
 *   `CF-Connecting-IP` on every request it proxies, so it cannot be forged
 *   through that path — but anyone able to reach the origin directly could set
 *   it to whatever they liked. **This function is exactly as trustworthy as the
 *   origin firewall is**; if the origin is ever opened to the internet again,
 *   the header becomes attacker-controlled input.
 * - **Falls back to `req.ip`** so local development and container health probes,
 *   which never go through Cloudflare, still get a usable key.
 */
export function clientIp(req: Request): string {
  const header = req.headers[CF_CONNECTING_IP];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return req.ip ?? 'unknown';
}
