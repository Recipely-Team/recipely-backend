import type { PrismaClient } from '@prisma/client';

// AdminJS must be imported dynamically due to ESM/CJS incompatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminjs = require('adminjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Database, Resource } = require('@adminjs/prisma');

export function createAdminJS(prisma: PrismaClient) {
  // @ts-ignore - AdminJS type compatibility
  adminjs.registerAdapter({ Database, Resource });

  const admin = new adminjs({
    databases: [prisma],
    rootPath: '/admin',
    branding: {
      companyName: 'Recipely Admin',
    },
  });

  return admin;
}