import type { NextFunction, Request, Response } from 'express';

/** How much longer than its freshness a browser may show a stale copy while it refetches. */
const STALE_FACTOR = 5;

/**
 * Lets browsers reuse a public read for `maxAgeSeconds` — taxonomy, trending,
 * the guest feed, the feature flags — so a page load does not ask the 1 GB box
 * the same question again, and a blip on the box is covered by the copy the
 * browser already has (`stale-while-revalidate`).
 *
 * Only for guests: a signed-in read carries viewer flags (liked, saved) and
 * must never be shared, so it is marked `private, no-cache`. `Vary` keeps the
 * language and the caller apart.
 */
export const publicReadCache =
  (maxAgeSeconds: number) =>
  (req: Request, res: Response, next: NextFunction): void => {
    res.vary('Accept-Language');
    res.vary('Authorization');
    res.setHeader(
      'Cache-Control',
      req.headers.authorization === undefined
        ? `public, max-age=${String(maxAgeSeconds)}, stale-while-revalidate=${String(maxAgeSeconds * STALE_FACTOR)}`
        : 'private, no-cache',
    );
    next();
  };
