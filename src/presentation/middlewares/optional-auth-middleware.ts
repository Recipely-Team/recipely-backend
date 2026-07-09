import type { NextFunction, Request, Response } from 'express';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';

/**
 * Optional bearer-auth for read-only browse endpoints that must work for guests.
 * If a valid Bearer token is present, `req.user` is populated exactly like
 * `createAuthMiddleware`. If the header is absent OR the token is invalid/expired,
 * the request continues anonymously (no `req.user`) — it never responds 401.
 * Controllers behind this middleware must treat `req.user` as optional.
 */
export function createOptionalAuthMiddleware(tokens: ITokenSigner) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      next();
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    const result = await tokens.verify(token);
    if (result.ok) {
      req.user = { id: result.value.sub, email: result.value.email };
    }
    next();
  };
}
