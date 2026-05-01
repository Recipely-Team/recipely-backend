import type { PrismaClient } from '@prisma/client';
import type { AdminJS as AdminJSType } from 'adminjs';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import { esmImport } from '@infrastructure/admin/esm-import';

// AdminJS 7.x and its adapters are ESM-only. tsc with module=commonjs lowers
// `await import()` to `require()`, which fails because:
//   1) @adminjs/express has no `require` export (subpath miss)
//   2) @adminjs/design-system's ./styled-components subpath is `import`-only
// `esmImport` keeps a real ESM dynamic import via the Function constructor.
//
// We use the `resources` API (not `databases`) because the @adminjs/prisma
// Database constructor expects `{ client, clientModule }`, not the raw client.
export async function createAdminJS(
  prisma: PrismaClient,
  hasher: IPasswordHasher,
): Promise<AdminJSType> {
  const { default: AdminJS } = await esmImport<typeof import('adminjs')>('adminjs');
  const { Database, Resource, getModelByName } =
    await esmImport<typeof import('@adminjs/prisma')>('@adminjs/prisma');

  AdminJS.registerAdapter({ Database, Resource });

  const userResource = {
    resource: { model: getModelByName('User'), client: prisma },
    options: {
      navigation: { name: 'Identity', icon: 'User' },
      properties: {
        id: { isVisible: { list: false, show: true, edit: false, filter: false } },
        passwordHash: { isVisible: false },
        password: {
          type: 'password' as const,
          isVisible: { list: false, show: false, edit: true, filter: false },
        },
        role: {
          availableValues: [
            { value: 'user', label: 'User' },
            { value: 'admin', label: 'Admin' },
          ],
        },
        createdAt: { isVisible: { list: true, show: true, edit: false, filter: true } },
        updatedAt: { isVisible: { list: false, show: true, edit: false, filter: false } },
      },
      actions: {
        new: {
          before: async (request: { payload?: Record<string, unknown> }) => {
            const payload = request.payload ?? {};
            const password = payload.password;
            if (typeof password === 'string' && password.length > 0) {
              payload.passwordHash = await hasher.hash(password);
            }
            delete payload.password;
            request.payload = payload;
            return request;
          },
        },
        edit: {
          before: async (request: { payload?: Record<string, unknown> }) => {
            const payload = request.payload ?? {};
            const password = payload.password;
            if (typeof password === 'string' && password.length > 0) {
              payload.passwordHash = await hasher.hash(password);
            }
            delete payload.password;
            request.payload = payload;
            return request;
          },
        },
      },
    },
  };

  const recipeResource = {
    resource: { model: getModelByName('Recipe'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Book' },
      listProperties: ['name', 'cuisine', 'difficulty', 'isPublished', 'rating', 'createdAt'],
      filterProperties: ['name', 'cuisine', 'difficulty', 'isPublished', 'categoryId', 'ownerId'],
      properties: {
        id: { isVisible: { list: false, show: true, edit: false, filter: false } },
        name: { type: 'key-value' as const },
        cuisine: { type: 'key-value' as const },
        ingredients: { type: 'string' as const, isArray: true },
        instructions: { type: 'string' as const, isArray: true },
        tags: { type: 'string' as const, isArray: true },
        mealType: { type: 'string' as const, isArray: true },
        createdAt: { isVisible: { list: true, show: true, edit: false, filter: true } },
        updatedAt: { isVisible: { list: false, show: true, edit: false, filter: false } },
      },
    },
  };

  const categoryResource = {
    resource: { model: getModelByName('Category'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Tag' },
      properties: {
        id: { isVisible: { list: false, show: true, edit: false, filter: false } },
        name: { type: 'key-value' as const },
        cuisine: { type: 'key-value' as const },
        createdAt: { isVisible: { list: true, show: true, edit: false, filter: true } },
      },
    },
  };

  const favoriteResource = {
    resource: { model: getModelByName('Favorite'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Heart' },
      actions: {
        new: { isAccessible: false },
        edit: { isAccessible: false },
      },
    },
  };

  const featureFlagResource = {
    resource: { model: getModelByName('FeatureFlag'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Settings' },
      actions: {
        delete: { isAccessible: false },
        bulkDelete: { isAccessible: false },
      },
    },
  };

  return new AdminJS({
    rootPath: '/admin',
    resources: [
      userResource,
      recipeResource,
      categoryResource,
      favoriteResource,
      featureFlagResource,
    ],
    branding: {
      companyName: 'Recipely Admin',
      withMadeWithLove: false,
    },
  });
}