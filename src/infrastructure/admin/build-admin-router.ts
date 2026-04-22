import type { Router } from 'express';
import type { AdminJS } from 'adminjs';
import type { PrismaClient } from '@prisma/client';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildAuthenticatedRouter } = require('@adminjs/express');

export function buildAdminRouter(
  admin: AdminJS,
  prisma: PrismaClient,
  bcryptRounds: number,
  jwtSecret: string,
): Router {
  const hasher = new BcryptPasswordHasher(bcryptRounds);

  const router = buildAuthenticatedRouter(
    admin,
    {
      cookieName: 'adminjs',
      cookiePassword: jwtSecret,
      authenticate: async (email: string, password: string) => {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.role !== 'admin') return null;
        const valid = await hasher.verify(password, user.passwordHash);
        if (!valid) return null;
        return { email: user.email, id: user.id, role: user.role };
      },
    },
    null,
    {
      secret: jwtSecret,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
    },
  );
  return router;
}