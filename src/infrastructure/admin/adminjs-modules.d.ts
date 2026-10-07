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

// The design-system components the custom admin fields render with. Typed
// loosely on purpose: they take the panel theme's tokens as props (`color`,
// `mb`, `p`, ...), which is the point of using them over inline styles.
declare module '@adminjs/design-system' {
  import type { ComponentType, ReactNode } from 'react';

  type ThemedProps = { children?: ReactNode; [prop: string]: unknown };

  export const Box: ComponentType<ThemedProps>;
  export const H4: ComponentType<ThemedProps>;
  export const Text: ComponentType<ThemedProps>;
  export const Link: ComponentType<ThemedProps>;
  export const Loader: ComponentType<ThemedProps>;
  export const Table: ComponentType<ThemedProps>;
  export const TableHead: ComponentType<ThemedProps>;
  export const TableBody: ComponentType<ThemedProps>;
  export const TableRow: ComponentType<ThemedProps>;
  export const TableCell: ComponentType<ThemedProps>;
}
