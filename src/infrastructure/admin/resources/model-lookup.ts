import type { PrismaClient } from '@prisma/client';

/**
 * What a per-feature resource builder needs from adminjs.ts: the Prisma client
 * and @adminjs/prisma's `getModelByName`, which is ESM-only and therefore only
 * reachable through the dynamic import adminjs.ts already does.
 */
export interface ModelLookup {
  readonly prisma: PrismaClient;
  readonly modelByName: (name: string) => unknown;
}
