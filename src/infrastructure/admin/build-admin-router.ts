import type { Router } from 'express';
import type { AdminJS } from 'adminjs';
import type { PrismaClient } from '@prisma/client';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { esmImport } from '@infrastructure/admin/esm-import';

export async function buildAdminRouter(
  admin: AdminJS,
  prisma: PrismaClient,
  bcryptRounds: number,
  jwtSecret: string,
  cookieSecure: boolean,
): Promise<Router> {
  const hasher = new BcryptPasswordHasher(bcryptRounds);

  const { buildAuthenticatedRouter } =
    await esmImport<typeof import('@adminjs/express')>('@adminjs/express');

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
      saveUninitialized: false,
      cookie: {
        secure: cookieSecure,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    },
  );
  return router;
}