import type { Request } from 'express';

/** The header Cloudflare sets to the real client address on every request it proxies. */
const CF_CONNECTING_IP = 'cf-connecting-ip';

/** `PROXY_DEPTH` at which Cloudflare is in the path and has rewritten the header. */
const DEPTH_WITH_CLOUDFLARE = 2;

/**
 * The address a request actually came from.
 *
 * @remarks
 * - **Why not plain `req.ip`.** nginx sits in front, so the socket address is
 *   nginx's and every caller collapses onto one value. Anything keyed on it —
 *   rate limits above all — stops distinguishing clients, which turns a
 *   per-caller limit into a global one: the first script to hit the cap locks
 *   everyone out. `trust proxy` is set to `PROXY_DEPTH` so Express counts back
 *   the right number of hops instead of believing the whole chain.
 * - **Why `CF-Connecting-IP` is only read at depth 2.** A header is worth
 *   exactly as much as the guarantee that a client could not have written it.
 *   Cloudflare overwrites this one on every request it proxies — but only for
 *   hostnames that are actually proxied. `api.recipely.net` is DNS-only, so a
 *   caller reaching nginx directly can send whatever value it likes, and
 *   trusting it would let an attacker pick a fresh rate-limit key per request
 *   and never hit a limit at all. `dev-api.recipely.net` IS proxied, so there
 *   the header is authoritative.
 * - **The default is the safe one.** `PROXY_DEPTH` defaults to 1; a hostname
 *   must be declared proxied before its headers are believed. Setting it too
 *   high is the dangerous direction, which is why it is a deployment-level
 *   value and not inferred at runtime.
 * - **Passed in, not imported.** `loadEnv` is parsed once at boot and handed
 *   down; reading `process.env` here would put a second source of truth behind
 *   a security decision.
 */
export function clientIp(req: Request, proxyDepth: number): string {
  if (proxyDepth >= DEPTH_WITH_CLOUDFLARE) {
    const header = req.headers[CF_CONNECTING_IP];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }
  }
  return req.ip ?? 'unknown';
}
