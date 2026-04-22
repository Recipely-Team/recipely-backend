import type { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Database, Resource } = require('@adminjs/prisma');

export async function createAdminJS(prisma: PrismaClient) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const adminjs = require('adminjs');

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