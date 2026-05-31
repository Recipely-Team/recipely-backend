import type { Request } from 'express';
import { UnauthorizedFailure } from '@core/failure';

/**
 * Returns the authenticated user from the request, or throws an
 * UnauthorizedFailure (→ 401 via the error handler) when no valid token was
 * presented. Use in controllers mounted behind `authMiddleware`: it narrows
 * the optional `req.user` type AND guarantees the standard translated 401
 * envelope if the guarantee is ever missing. asyncHandler routes the thrown
 * Failure to the error handler.
 */
export function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) {
    throw new UnauthorizedFailure('errors.unauthorized.missing_token');
  }
  return req.user;
}
