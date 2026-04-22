import type { Router } from 'express';
import type { AdminJS } from 'adminjs';
import type { PrismaClient } from '@prisma/client';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';

export async function buildAdminRouter(
  admin: AdminJS,
  prisma: PrismaClient,
  bcryptRounds: number,
  jwtSecret: string,
): Promise<Router> {
  const hasher = new BcryptPasswordHasher(bcryptRounds);

  const { buildAuthenticatedRouter } = await import('@adminjs/express');

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