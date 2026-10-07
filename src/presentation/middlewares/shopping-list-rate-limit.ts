import type { RequestHandler } from 'express';
import { createRateLimitMiddleware } from '@presentation/middlewares/rate-limit-middleware';

const SHOPPING_LIST_WINDOW_MS = 60_000;
const SHOPPING_LIST_WRITES_MAX = 120;

/**
 * Per-user limiter for shopping-list writes.
 *
 * @remarks
 * - **Why** — ticking items off in a shop is a burst of small PATCHes, so the
 *   budget is generous (two a second, sustained for a minute) yet still far
 *   below a loop writing rows as fast as one token can send.
 * - **Mount after auth** — the key is `req.user.id`, so the budget is per account.
 */
export function createShoppingListRateLimitMiddleware(proxyDepth: number): RequestHandler {
  return createRateLimitMiddleware({
    proxyDepth,
    windowMs: SHOPPING_LIST_WINDOW_MS,
    max: SHOPPING_LIST_WRITES_MAX,
    messageKey: 'errors.too_many_requests.shopping_list',
  });
}
