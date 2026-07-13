import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedFailure } from '@core/failure';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import type { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';

/**
 * Verifies the bearer token, then confirms the account behind it still exists.
 * The second step is not redundant: account deletion tombstones the user rather
 * than dropping it, and the token is a stateless JWT, so a token minted before
 * deletion stays cryptographically valid until it expires.
 *
 * Failures are handed to `next` rather than written here, so they pick up the
 * caller's locale and the fail-closed key handling of the central error handler.
 */
export function createAuthMiddleware(tokens: ITokenSigner, ensureActive: EnsureAccountActiveUseCase) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      next(new UnauthorizedFailure('errors.unauthorized.missing_token'));
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    const result = await tokens.verify(token);
    if (!result.ok) {
      next(result.failure);
      return;
    }

    const activeResult = await ensureActive.execute({ userId: result.value.sub });
    if (!activeResult.ok) {
      next(activeResult.failure);
      return;
    }

    req.user = { id: result.value.sub, email: result.value.email };
    next();
  };
}
