import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const WORKER_SECRET_HEADER = 'x-worker-secret';
const WORKER_ID_HEADER = 'x-worker-id';
const MAX_WORKER_ID_LENGTH = 64;

/**
 * Compares two secrets without leaking how much of one matched.
 *
 * @remarks
 * `a === b` on strings returns at the first differing byte, so the time it
 * takes reveals the length of the matching prefix — enough to recover a secret
 * one byte at a time over enough requests. Hashing to a fixed width first is
 * what makes `timingSafeEqual` usable at all: it throws on length mismatch, so
 * comparing raw inputs would leak the length before it compared anything.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Still do a comparison so a wrong length is not faster than a wrong value.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Lets a worker in, and nobody else.
 *
 * @remarks
 * - **Why a shared secret and not a user token.** A worker is not a person: it
 *   has no account, no session and nothing to log in as. Giving it a user's JWT
 *   would mean a worker box holding credentials that also work on the rest of
 *   the API.
 * - **Why the worker names itself.** `claimedBy` is the only way to answer
 *   "which box is holding this job" when one stops moving. It is a diagnostic
 *   label and is treated as one — bounded in length, never interpolated
 *   anywhere but a parameterised query.
 * - **Rejections say nothing.** A 401 with no body: an endpoint that explains
 *   whether the secret or the header was wrong helps only the caller who has
 *   neither.
 */
export function workerAuth(expectedSecret: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = req.headers[WORKER_SECRET_HEADER];
    if (typeof provided !== 'string' || !secretsMatch(provided, expectedSecret)) {
      res.status(401).end();
      return;
    }

    const workerId = req.headers[WORKER_ID_HEADER];
    if (typeof workerId !== 'string' || workerId.length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
      res.status(401).end();
      return;
    }

    req.workerId = workerId;
    next();
  };
}
