// Type shims for AdminJS adapter packages that ship `exports` maps
// without `main`/`types` fallbacks. moduleResolution: "node" cannot read
// `exports`, so without these shims TypeScript fails to find the modules.
// We re-declare the public surface our code uses.

declare module '@adminjs/prisma' {
  import type { PrismaClient } from '@prisma/client';
  import type { BaseDatabase, BaseResource } from 'adminjs';

  export const Database: typeof BaseDatabase & {
    new (args: { client: PrismaClient; clientModule?: unknown }): BaseDatabase;
  };

  export const Resource: typeof BaseResource & {
    new (args: { model: unknown; client: PrismaClient; clientModule?: unknown }): BaseResource;
  };

  export function getModelByName(name: string, clientModule?: unknown): unknown;
}

declare module '@adminjs/express' {
  import type { Router } from 'express';
  import type { AdminJS, CurrentAdmin } from 'adminjs';
  import type { SessionOptions } from 'express-session';

  export interface AuthenticationOptions {
    cookiePassword: string;
    cookieName?: string;
    authenticate: (email: string, password: string) => Promise<CurrentAdmin | null>;
  }

  export function buildRouter(admin: AdminJS, predefinedRouter?: Router | null): Router;

  export function buildAuthenticatedRouter(
    admin: AdminJS,
    auth: AuthenticationOptions,
    predefinedRouter?: Router | null,
    sessionOptions?: SessionOptions,
  ): Router;
}
