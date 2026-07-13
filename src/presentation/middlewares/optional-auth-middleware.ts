import type { NextFunction, Request, Response } from 'express';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import type { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';

/**
 * Optional bearer-auth for read-only browse endpoints that must work for guests.
 * If a valid Bearer token is present, `req.user` is populated exactly like
 * `createAuthMiddleware`. If the header is absent OR the token is invalid/expired,
 * the request continues anonymously (no `req.user`) — it never responds 401.
 * Controllers behind this middleware must treat `req.user` as optional.
 *
 * A token belonging to a deleted account is treated as absent: the request goes on
 * as a guest rather than as its former owner (personalised flags like `isFavorite`
 * must not resolve against a tombstone).
 */
export function createOptionalAuthMiddleware(tokens: ITokenSigner, ensureActive: EnsureAccountActiveUseCase) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      next();
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    const result = await tokens.verify(token);
    if (result.ok) {
      const activeResult = await ensureActive.execute({ userId: result.value.sub });
      if (activeResult.ok) {
        req.user = { id: result.value.sub, email: result.value.email };
      }
    }
    next();
  };
}
