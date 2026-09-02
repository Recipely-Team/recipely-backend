import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedFailure } from '@core/failure';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import { failureToHttp } from '@presentation/http/failure-to-http';

/**
 * Verifies the bearer token, then confirms the account behind it still exists.
 * The second step is not redundant: account deletion tombstones the user rather
 * than dropping it, and the token is a stateless JWT, so a token minted before
 * deletion stays cryptographically valid until it expires.
 */
export function createAuthMiddleware(tokens: TokenSignerInterface, ensureActive: EnsureAccountActiveUseCase) {
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

    const activeResult = await ensureActive.execute({ userId: result.value.sub });
    if (!activeResult.ok) {
      const { status, body } = failureToHttp(activeResult.failure);
      res.status(status).json(body);
      return;
    }

    req.user = { id: result.value.sub, email: result.value.email };
    next();
  };
}
