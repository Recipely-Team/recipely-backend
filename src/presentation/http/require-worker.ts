import type { Request } from 'express';
import { UnauthorizedFailure } from '@core/failure';

/**
 * Returns the worker that authenticated on this request, or throws (→ 401).
 *
 * The mirror of {@link requireUser} for the internal endpoints: it narrows the
 * optional `req.workerId` AND makes a handler mounted without `workerAuth`
 * fail closed. A handler that read `req.workerId` directly would silently treat
 * an unauthenticated caller as a worker named `undefined`, and `claimedBy`
 * would then match nothing — so every completion would be rejected with a
 * confusing "not claimed by this worker" instead of a plain 401.
 */
export function requireWorker(req: Request): string {
  if (req.workerId === undefined || req.workerId.length === 0) {
    throw new UnauthorizedFailure('errors.unauthorized.missing_token');
  }
  return req.workerId;
}
