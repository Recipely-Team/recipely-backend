import type { PrismaClient } from '@prisma/client';
import type { AdminJS as AdminJSType } from 'adminjs';
import { ComponentLoader } from 'adminjs';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import { esmImport } from '@infrastructure/admin/esm-import';
import { CUISINE_KEY_VALUES } from '@domain/recipes/cuisine-key';
import { RECIPE_CATEGORY_VALUES } from '@domain/recipes/recipe-category';
import { Difficulty } from '@domain/recipes/difficulty';
import { ModerationStatus } from '@domain/recipes/moderation-status';

const SUPPORTED_LOCALES = ['en', 'tr', 'de', 'fr', 'es', 'ar'] as const;

// Enum DB values are SCREAMING_SNAKE_CASE; render them as Title Case in the UI.
// 'MIDDLE_EASTERN' -> 'Middle Eastern'.
function toLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function enumValues(values: readonly string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: toLabel(v) }));
}

function buildComponentLoader(): ComponentLoader {
  const loader = new ComponentLoader();
  // Localized single-string field (recipe name).
  loader.add('KeyValueInput', './components/key-value-input');
  loader.add('KeyValueShow', './components/key-value-show');
  loader.add('KeyValueList', './components/key-value-list');
  // Localized array fields (ingredients, instructions, tags, mealType, tips).
  loader.add('KeyValueArrayInput', './components/key-value-array-input');
  loader.add('KeyValueTagsShow', './components/key-value-tags-show');
  loader.add('KeyValueIngredientsShow', './components/key-value-ingredients-show');
  loader.add('KeyValueInstructionsShow', './components/key-value-instructions-show');
  // Nutrition object field.
  loader.add('NutritionInput', './components/nutrition-input');
  loader.add('NutritionShow', './components/nutrition-show');
  // Title-Case rendering of enum values in list/show.
  loader.add('EnumLabel', './components/enum-label');
  loader.add('ImageUpload', './components/image-upload');
  // Safe rendering of a Recipe reference (its title is localized `name` JSON).
  loader.add('RecipeRefCell', './components/recipe-ref-cell');
  return loader;
}

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
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
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

  // Keep Recipe.totalTimeMinutes (a materialized prep+cook total backing the
  // ?maxTime= index) in sync whenever the admin creates or edits a recipe — the
  // application layer does this on the API path, so the admin must too.
  const syncTotalTime = (request: { payload?: Record<string, unknown> }) => {
    const payload = request.payload ?? {};
    const prep = Number(payload.prepTimeMinutes ?? 0);
    const cook = Number(payload.cookTimeMinutes ?? 0);
    payload.totalTimeMinutes = (Number.isFinite(prep) ? prep : 0) + (Number.isFinite(cook) ? cook : 0);
    request.payload = payload;
    return request;
  };

  const recipeResource = {
    resource: { model: getModelByName('Recipe'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Book' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: [
        'name',
        'cuisine',
        'category',
        'difficulty',
        'isPublished',
        'moderationStatus',
        'rating',
        'createdAt',
      ],
      filterProperties: [
        'cuisine',
        'category',
        'difficulty',
        'isPublished',
        'moderationStatus',
        'ownerId',
      ],
      editProperties: [
        'name',
        'cuisine',
        'category',
        'difficulty',
        'ingredients',
        'instructions',
        'prepTimeMinutes',
        'cookTimeMinutes',
        'servings',
        'caloriesPerServing',
        'nutrition',
        'tips',
        'tags',
        'mealType',
        'image',
        'ownerId',
        'isPublished',
        'moderationStatus',
      ],
      showProperties: [
        'id',
        'name',
        'cuisine',
        'category',
        'difficulty',
        'ingredients',
        'instructions',
        'prepTimeMinutes',
        'cookTimeMinutes',
        'totalTimeMinutes',
        'servings',
        'caloriesPerServing',
        'nutrition',
        'tips',
        'tags',
        'mealType',
        'image',
        'rating',
        'viewCount',
        'commentCount',
        'isPublished',
        'moderationStatus',
        'ownerId',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        id: { isVisible: { list: false, show: true, edit: false, filter: false } },
        name: { components: { edit: 'KeyValueInput', show: 'KeyValueShow', list: 'KeyValueList' } },
        cuisine: {
          availableValues: enumValues(CUISINE_KEY_VALUES),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
        category: {
          availableValues: enumValues(RECIPE_CATEGORY_VALUES),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
        difficulty: {
          availableValues: enumValues(Object.values(Difficulty)),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
        moderationStatus: {
          availableValues: enumValues(Object.values(ModerationStatus)),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
        image: { components: { edit: 'ImageUpload' } },
        ingredients: { components: { edit: 'KeyValueArrayInput', show: 'KeyValueIngredientsShow' } },
        instructions: { components: { edit: 'KeyValueArrayInput', show: 'KeyValueInstructionsShow' } },
        tags: { components: { edit: 'KeyValueArrayInput', show: 'KeyValueTagsShow' } },
        mealType: { components: { edit: 'KeyValueArrayInput', show: 'KeyValueTagsShow' } },
        tips: { components: { edit: 'KeyValueArrayInput', show: 'KeyValueIngredientsShow' } },
        nutrition: { components: { edit: 'NutritionInput', show: 'NutritionShow' } },
        rating: { isVisible: { list: true, show: true, edit: false, filter: false } },
        viewCount: { isVisible: { list: false, show: true, edit: false, filter: false } },
        commentCount: { isVisible: { list: false, show: true, edit: false, filter: false } },
        totalTimeMinutes: { isVisible: { list: false, show: true, edit: false, filter: false } },
        // FK reference — @adminjs/prisma renders ownerId as a searchable User picker.
        ownerId: { isVisible: { list: false, show: true, edit: true, filter: true } },
        owner: { isVisible: false },
        sourceUrl: { isVisible: false },
        createdAt: { isVisible: { list: true, show: true, edit: false, filter: true } },
        updatedAt: { isVisible: { list: false, show: true, edit: false, filter: false } },
      },
      actions: {
        new: { before: syncTotalTime },
        edit: { before: syncTotalTime },
      },
    },
  };

  // Read-only resources: join tables, audit logs, and ephemeral records that the
  // admin should be able to inspect but not hand-edit (id/created_at are managed
  // by the app, and mutating these by hand would desync derived counters/state).
  const readOnlyActions = {
    new: { isAccessible: false },
    edit: { isAccessible: false },
  };

  // The Recipe reference column must use a custom cell — the default reference
  // renderer prints the recipe title, which is localized `name` JSON (an object)
  // and throws React error #31. @adminjs/prisma exposes the *relation* field
  // (`recipe`) as the reference property; its value is the FK uuid and the
  // scalar FK column (recipeId/generatedRecipeId) is isReadOnly so the adapter
  // never registers it as a separate property.
  const recipeRefProperty = {
    recipe: { components: { list: 'RecipeRefCell', show: 'RecipeRefCell' } },
  };

  const favoriteResource = {
    resource: { model: getModelByName('Favorite'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Heart' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      properties: { ...recipeRefProperty },
      actions: { ...readOnlyActions },
    },
  };

  // Intentionally fully editable: a recipe's media gallery is content the admin
  // curates directly (no derived counters depend on these rows).
  const recipeMediaResource = {
    resource: { model: getModelByName('RecipeMedia'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Image' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      properties: { ...recipeRefProperty },
    },
  };

  const recipeLikeResource = {
    resource: { model: getModelByName('RecipeLike'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'ThumbsUp' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      properties: { ...recipeRefProperty },
      actions: { ...readOnlyActions },
    },
  };

  const commentResource = {
    resource: { model: getModelByName('Comment'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'MessageSquare' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      properties: {
        ...recipeRefProperty,
        moderationStatus: {
          availableValues: enumValues(Object.values(ModerationStatus)),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
      },
      actions: {
        // Edit stays enabled so admins can change moderationStatus, but creating
        // or deleting comment rows directly would desync Recipe.commentCount,
        // which is maintained transactionally only by the comment use cases.
        new: { isAccessible: false },
        delete: { isAccessible: false },
        bulkDelete: { isAccessible: false },
      },
    },
  };

  const commentLikeResource = {
    resource: { model: getModelByName('CommentLike'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'ThumbsUp' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      actions: { ...readOnlyActions },
    },
  };

  const userFollowResource = {
    resource: { model: getModelByName('UserFollow'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'Users' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      actions: { ...readOnlyActions },
    },
  };

  const notificationResource = {
    resource: { model: getModelByName('Notification'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'Bell' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      properties: { ...recipeRefProperty },
      actions: { ...readOnlyActions },
    },
  };

  const recipeDraftResource = {
    resource: { model: getModelByName('RecipeDraft'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Edit' },
      sort: { sortBy: 'updatedAt', direction: 'desc' as const },
      actions: { ...readOnlyActions },
    },
  };

  const aiGenerationLogResource = {
    resource: { model: getModelByName('AIGenerationLog'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Cpu' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      properties: { ...recipeRefProperty },
      actions: { ...readOnlyActions },
    },
  };

  const fcmTokenResource = {
    resource: { model: getModelByName('FcmToken'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Smartphone' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      actions: { ...readOnlyActions },
    },
  };

  // `token` is the live reset credential (raw random bytes, not a hash) — an
  // admin who could read it could take over any account inside the 1h window.
  // Hidden everywhere; expiry/usage is inspectable via the other columns.
  const passwordResetTokenResource = {
    resource: { model: getModelByName('PasswordResetToken'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Key' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      properties: {
        token: { isVisible: false },
      },
      actions: { ...readOnlyActions },
    },
  };

  // passwordHash/codeHash are bcrypt digests, not usable credentials, but hiding
  // them follows least-privilege and matches how User.passwordHash is handled.
  const pendingRegistrationResource = {
    resource: { model: getModelByName('PendingRegistration'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'UserPlus' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      properties: {
        passwordHash: { isVisible: false },
        codeHash: { isVisible: false },
      },
      actions: { ...readOnlyActions },
    },
  };

  const feedbackResource = {
    resource: { model: getModelByName('Feedback'), client: prisma },
    options: {
      navigation: { name: 'Support', icon: 'HelpCircle' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['category', 'subject', 'status', 'userId', 'createdAt'],
      filterProperties: ['category', 'status', 'userId'],
      showProperties: [
        'id',
        'userId',
        'category',
        'subject',
        'message',
        'rating',
        'contactEmail',
        'status',
        'createdAt',
        'updatedAt',
      ],
      editProperties: ['status'],
      properties: {
        id: { isVisible: { list: false, show: true, edit: false, filter: false } },
        category: {
          availableValues: enumValues(['bug', 'suggestion', 'help', 'other']),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
        status: {
          availableValues: enumValues(['new', 'in_progress', 'resolved']),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
        createdAt: { isVisible: { list: true, show: true, edit: false, filter: true } },
        updatedAt: { isVisible: { list: false, show: true, edit: false, filter: false } },
      },
      actions: {
        new: { isAccessible: false },
        delete: { isAccessible: false },
        bulkDelete: { isAccessible: false },
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
    componentLoader: buildComponentLoader(),
    rootPath: '/admin',
    resources: [
      userResource,
      recipeResource,
      recipeMediaResource,
      recipeDraftResource,
      favoriteResource,
      recipeLikeResource,
      commentResource,
      commentLikeResource,
      userFollowResource,
      notificationResource,
      aiGenerationLogResource,
      fcmTokenResource,
      passwordResetTokenResource,
      pendingRegistrationResource,
      feedbackResource,
      featureFlagResource,
    ],
    branding: {
      companyName: 'Recipely Admin',
      withMadeWithLove: false,
    },
    env: {
      AVAILABLE_LANGUAGES: SUPPORTED_LOCALES.join(','),
      BASE_URL: process.env.BASE_URL ?? '',
    },
  });
}
