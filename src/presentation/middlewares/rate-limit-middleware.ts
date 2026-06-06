import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { TooManyRequestsFailure } from '@core/failure';

export interface RateLimitOptions {
  /** Fixed window length in milliseconds. */
  readonly windowMs: number;
  /** Max requests allowed per key within the window. */
  readonly max: number;
  /** i18n key for the failure message surfaced to the client. */
  readonly messageKey: string;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter, keyed by authenticated user id (falling
 * back to client IP). On the constrained single-instance host this needs no
 * external store; the map is swept lazily so it never grows unbounded.
 *
 * Fixed window (not sliding): a key resets only once its window fully elapses,
 * so a burst straddling a boundary can reach up to ~2×`max` — acceptable for a
 * cost/abuse cap, not a precise quota.
 *
 * On exceed it forwards a {@link TooManyRequestsFailure} to the error handler
 * (→ HTTP 429 `too_many_requests`) and sets `Retry-After`. Mount AFTER the auth
 * middleware so `req.user` is populated and the limit is per-user, not global.
 * The IP fallback only matters on unauthenticated routes; it assumes
 * `trust proxy` is configured before reuse there, or all clients behind a proxy
 * collapse onto one key.
 */
export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const windows = new Map<string, WindowEntry>();
  let lastSweepAt = Date.now();

  const sweep = (now: number): void => {
    if (now - lastSweepAt < options.windowMs) return;
    lastSweepAt = now;
    for (const [key, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(key);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    sweep(now);

    const key = req.user?.id ?? req.ip ?? 'anonymous';
    const entry = windows.get(key);

    if (entry === undefined || entry.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (entry.count >= options.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      next(new TooManyRequestsFailure(options.messageKey));
      return;
    }

    entry.count += 1;
    next();
  };
}
