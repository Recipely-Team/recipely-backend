import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { UnauthorizedFailure, ForbiddenFailure } from '@core/failure';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import { failureToHttp } from '@presentation/http/failure-to-http';

export function createAdminAuthMiddleware(tokens: ITokenSigner, prisma: PrismaClient) {
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

    const user = await prisma.user.findUnique({
      where: { id: result.value.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user || user.role !== 'admin') {
      const { status, body } = failureToHttp(new ForbiddenFailure('Admin access required'));
      res.status(status).json(body);
      return;
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  };
}
