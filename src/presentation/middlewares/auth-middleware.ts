import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedFailure } from '@core/failure';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import { failureToHttp } from '@presentation/http/failure-to-http';

export function createAuthMiddleware(tokens: ITokenSigner) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      const { status, body } = failureToHttp(new UnauthorizedFailure('Missing bearer token'));
      res.status(status).json(body);
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    const result = await tokens.verify(token);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure);
      res.status(status).json(body);
      return;
    }
    req.user = { id: result.value.sub, email: result.value.email };
    next();
  };
}

/**
 * Parses the JWT when present and populates `req.user`, but never rejects the
 * request when the token is absent or invalid. Used on public read endpoints
 * (recipe list, recipe detail) so social data (likedByMe) is returned for
 * authenticated callers while guests still get the full response.
 */
export function createOptionalAuthMiddleware(tokens: ITokenSigner) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length).trim();
      const result = await tokens.verify(token);
      if (result.ok) {
        req.user = { id: result.value.sub, email: result.value.email };
      }
    }
    next();
  };
}
