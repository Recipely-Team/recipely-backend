import type { RequestHandler } from 'express';
import { createRateLimitMiddleware } from '@presentation/middlewares/rate-limit-middleware';

/** One hour: the heartbeat is sent once per app start, so an hourly budget is generous. */
const DEVICE_HEARTBEAT_WINDOW_MS = 3_600_000;
const DEVICE_HEARTBEAT_MAX = 30;

/**
 * Per-user limiter for `POST /me/devices`, the per-start device heartbeat.
 *
 * @remarks
 * - **Why** — every call writes a row carrying the caller's ip and user agent,
 *   so without a limit one valid token could write as often as it can send.
 *   Thirty an hour is far above a person restarting the app and far below a loop.
 * - **Mount after auth** — the key is `req.user.id`, so the budget is per account.
 */
export function createDeviceRateLimitMiddleware(proxyDepth: number): RequestHandler {
  return createRateLimitMiddleware({
    proxyDepth,
    windowMs: DEVICE_HEARTBEAT_WINDOW_MS,
    max: DEVICE_HEARTBEAT_MAX,
    messageKey: 'errors.too_many_requests.device_heartbeat',
  });
}
