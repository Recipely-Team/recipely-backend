import type { PrismaClient } from '@prisma/client';
import type { AdminJS as AdminJSType } from 'adminjs';
import { ComponentLoader } from 'adminjs';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { DeleteCommentUseCase } from '@application/comments/use-cases/delete-comment-use-case';
import { createUserPayloadHook } from '@infrastructure/admin/user-payload-hook';
import type { ModerateRecipeUseCase } from '@application/recipes/use-cases/moderate-recipe-use-case';
import type { ModerateCommentUseCase } from '@application/comments/use-cases/moderate-comment-use-case';
import type { SuspendUserUseCase } from '@application/auth/use-cases/suspend-user-use-case';
import type { UnsuspendUserUseCase } from '@application/auth/use-cases/unsuspend-user-use-case';
import { esmImport } from '@infrastructure/admin/esm-import';
import { createCommentDeleteHandler } from '@infrastructure/admin/comment-delete-action';
import { createModerationActionHandler } from '@infrastructure/admin/moderation-action';
import { createSuspendUserActionHandler } from '@infrastructure/admin/suspend-user-action';
import { buildDashboardHandler } from '@infrastructure/admin/dashboard-handler';
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

// Binds RefCell to a model's relation field (see ref-cell.tsx for why it must
// be the relation field, e.g. `owner`, and never the scalar FK column).
function refProperty(
  path: string,
  refResourceId: string,
  labelField: string,
  opts: { labelStrategy?: 'localizedJson'; maxLength?: number } = {},
) {
  return {
    [path]: {
      components: { list: 'RefCell', show: 'RefCell' },
      custom: { refResourceId, labelField, ...opts },
    },
  };
}

// A scalar FK column that a RefCell relation field now covers is redundant in
// list/show (a UUID next to the same value's friendly link) but stays a
// searchable picker on edit and an exact-id filter — mirrors how Recipe.ownerId
// was already handled before this helper existed.
function fk() {
  return { isVisible: { list: false, show: false, edit: true, filter: true } };
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
  // Date-only rendering for the `date` column AdminJS would otherwise print as
  // a midnight-UTC timestamp — see day-cell.tsx.
  loader.add('DayCell', './components/day-cell');
  loader.add('ImageUpload', './components/image-upload');
  // Readable FK relation cell (Recipe/User/Comment/...), parameterized via
  // each bound property's `custom` config — see ref-cell.tsx.
  loader.add('RefCell', './components/ref-cell');
  // A User's recipes/comments/favorites/devices/feedback, as a record action tab.
  loader.add('UserActivityPanel', './components/user-activity-panel');
  // Suspend form (captures a reason) — see suspend-user-action.tsx.
  loader.add('SuspendUserAction', './components/suspend-user-action');
  // Landing page shown on panel open — counts + moderation queue + import health.
  loader.add('Dashboard', './components/dashboard');
  return loader;
}

// Dark theme, blue. The panel is read at night and the default light theme is
// painful then; the fix is not "make it black" — a #000 ground under #FFF text
// maximises halation, which is what actually tires the eye. So: a deep navy
// ground, softened text, and a sidebar set darker than the containers it holds
// so there is an edge to rest on.
//
// `branding.theme` takes a partial override, which is why this is a plain
// object and not a theme package: @adminjs/themes would add a second bundle to
// an ESM/CJS interop that is already the fragile part of this setup (see
// esm-import.ts), on a container capped at 384 MiB.
//
// primary100 is the mobile app's own primary so the panel reads as the same
// family, and the semantic colours are the app's dark-theme ones — saturated
// red/green on a dark ground vibrates and is exactly what we are avoiding.
const DARK_BLUE_THEME = {
  colors: {
    bg: '#0F1B2E',
    container: '#16263F',
    sidebar: '#0C1626',
    filterBg: '#16263F',
    hoverBg: '#1E3350',
    border: '#24374F',
    inputBorder: '#2C405C',
    separator: '#1E3350',
    highlight: '#1E3350',

    primary100: '#60A5FA',
    primary80: '#7BB4FB',
    primary60: '#93C5FD',
    primary40: '#B6D8FE',
    primary20: '#D8EBFF',
    accent: '#60A5FA',

    text: '#DDE6F5',
    grey100: '#DDE6F5',
    grey80: '#B4C3D8',
    grey60: '#8CA0BC',
    grey40: '#5C6E88',
    grey20: '#2C405C',
    white: '#F2F6FC',
    black: '#0A1220',

    error: '#F28B82',
    errorDark: '#E06B62',
    errorLight: '#3A1F1E',
    success: '#81C995',
    successDark: '#5FA873',
    successLight: '#16301F',
    warning: '#FDD663',
    warningDark: '#E0B840',
    warningLight: '#332A12',
    info: '#60A5FA',
    infoDark: '#3B82F6',
    infoLight: '#16263F',
    love: '#F28B82',
  },
};

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
  rootPath: string,
  baseUrl: string,
  deleteCommentUseCase: DeleteCommentUseCase,
  moderateRecipeUseCase: ModerateRecipeUseCase,
  moderateCommentUseCase: ModerateCommentUseCase,
  suspendUserUseCase: SuspendUserUseCase,
  unsuspendUserUseCase: UnsuspendUserUseCase,
): Promise<AdminJSType> {
  const { default: AdminJS } = await esmImport<typeof import('adminjs')>('adminjs');
  const { Database, Resource, getModelByName } =
    await esmImport<typeof import('@adminjs/prisma')>('@adminjs/prisma');

  AdminJS.registerAdapter({ Database, Resource });

  const userPayloadHook = createUserPayloadHook(hasher);

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
        // Hidden from the form AND stripped from the payload in the new/edit
        // before-hooks below — `isVisible.edit: false` alone is cosmetic, and a
        // raw POST would otherwise write these columns straight past
        // SuspendUserUseCase/UnsuspendUserUseCase.
        suspendedAt: { isVisible: { list: true, show: true, edit: false, filter: true } },
        suspensionReason: { isVisible: { list: false, show: true, edit: false, filter: false } },
      },
      actions: {
        new: {
          before: userPayloadHook,
        },
        edit: {
          before: userPayloadHook,
        },
        // Renders as its own tab beside Show/Edit/Delete (AdminJS's record-action
        // buttons). Deliberately not `actions.show.component` — overriding that
        // would throw away AdminJS's default field rendering for no gain. The
        // handler only has to return the record so the tab loads; the component
        // itself fetches the user's recipes/comments/favorites/devices/feedback
        // via ApiClient.resourceAction.
        activity: {
          actionType: 'record' as const,
          icon: 'Activity',
          component: 'UserActivityPanel',
          handler: async (
            _request: unknown,
            _response: unknown,
            context: { record?: { toJSON: (currentAdmin?: unknown) => unknown }; currentAdmin?: unknown },
          ) => ({ record: context.record?.toJSON(context.currentAdmin) }),
        },
        suspend: {
          actionType: 'record' as const,
          icon: 'Slash',
          variant: 'danger' as const,
          component: 'SuspendUserAction',
          isVisible: (context: { record?: { params?: Record<string, unknown> } }) =>
            !context.record?.params?.suspendedAt,
          handler: createSuspendUserActionHandler(
            (recordId, reason, actorId) =>
              suspendUserUseCase.execute({
                userId: recordId,
                ...(reason !== undefined ? { reason } : {}),
                ...(actorId !== undefined ? { actorId } : {}),
              }),
            'User suspended',
          ),
        },
        unsuspend: {
          actionType: 'record' as const,
          icon: 'CheckCircle',
          variant: 'success' as const,
          component: false,
          guard: 'Lift the suspension for this user?',
          isVisible: (context: { record?: { params?: Record<string, unknown> } }) =>
            Boolean(context.record?.params?.suspendedAt),
          handler: createModerationActionHandler(
            (recordId, actorId) =>
              unsuspendUserUseCase.execute({
                userId: recordId,
                ...(actorId !== undefined ? { actorId } : {}),
              }),
            'Suspension lifted',
          ),
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
        'owner',
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
        // FK reference — @adminjs/prisma renders ownerId as a searchable User
        // picker on edit; hidden from show/list now that `owner` (RefCell)
        // covers the same value with a friendly link.
        ownerId: fk(),
        owner: {
          isVisible: { list: false, show: true, edit: false, filter: false },
          ...refProperty('owner', 'User', 'displayName').owner,
        },
        sourceUrl: { isVisible: false },
        createdAt: { isVisible: { list: true, show: true, edit: false, filter: true } },
        updatedAt: { isVisible: { list: false, show: true, edit: false, filter: false } },
      },
      actions: {
        new: { before: syncTotalTime },
        edit: { before: syncTotalTime },
        approve: {
          actionType: 'record' as const,
          icon: 'Check',
          variant: 'success' as const,
          component: false,
          isVisible: (context: { record?: { params?: Record<string, unknown> } }) =>
            context.record?.params?.moderationStatus !== 'approved',
          handler: createModerationActionHandler(
            (recordId) => moderateRecipeUseCase.execute({ recipeId: recordId, decision: 'approved' }),
            'Recipe approved',
          ),
        },
        reject: {
          actionType: 'record' as const,
          icon: 'X',
          variant: 'danger' as const,
          component: false,
          guard: 'Reject this recipe and unpublish it?',
          isVisible: (context: { record?: { params?: Record<string, unknown> } }) =>
            context.record?.params?.moderationStatus !== 'rejected',
          handler: createModerationActionHandler(
            (recordId) => moderateRecipeUseCase.execute({ recipeId: recordId, decision: 'rejected' }),
            'Recipe rejected',
          ),
        },
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

  // The Recipe reference column must use RefCell with labelStrategy
  // 'localizedJson' — the default reference renderer prints the recipe title,
  // which is localized `name` JSON (an object), and rendering that object
  // directly throws React error #31.
  const recipeRefProperty = refProperty('recipe', 'Recipe', 'name', { labelStrategy: 'localizedJson' });
  const userRefProperty = (path: string) => refProperty(path, 'User', 'displayName');
  const commentRefProperty = (path: string) => refProperty(path, 'Comment', 'body', { maxLength: 60 });

  // Fully open (new/edit/delete): the favorite count shown on a recipe is
  // computed live via a Prisma `_count`/`.count()` at read time (see
  // PrismaRecipeRepository / PrismaUserProfileRepository), not a stored
  // column, so hand-editing this join table cannot desync a counter.
  const favoriteResource = {
    resource: { model: getModelByName('Favorite'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Heart' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['recipe', 'user', 'createdAt'],
      filterProperties: ['recipeId', 'userId', 'createdAt'],
      properties: {
        ...recipeRefProperty,
        ...userRefProperty('user'),
        recipeId: fk(),
        userId: fk(),
      },
    },
  };

  // Intentionally fully editable: a recipe's media gallery is content the admin
  // curates directly (no derived counters depend on these rows).
  const recipeMediaResource = {
    resource: { model: getModelByName('RecipeMedia'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Image' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['recipe', 'type', 'position', 'createdAt'],
      filterProperties: ['recipeId', 'type', 'createdAt'],
      properties: { ...recipeRefProperty, recipeId: fk() },
    },
  };

  // Fully open: Recipe.rating/likeCount reads are also live-aggregated, same
  // rationale as Favorite above.
  const recipeLikeResource = {
    resource: { model: getModelByName('RecipeLike'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'ThumbsUp' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['recipe', 'user', 'createdAt'],
      filterProperties: ['recipeId', 'userId', 'createdAt'],
      properties: {
        ...recipeRefProperty,
        ...userRefProperty('user'),
        recipeId: fk(),
        userId: fk(),
      },
    },
  };

  const commentResource = {
    resource: { model: getModelByName('Comment'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'MessageSquare' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['body', 'recipe', 'author', 'moderationStatus', 'rating', 'createdAt'],
      filterProperties: ['recipeId', 'authorId', 'moderationStatus', 'createdAt'],
      properties: {
        ...recipeRefProperty,
        ...userRefProperty('author'),
        recipeId: fk(),
        authorId: fk(),
        moderationStatus: {
          availableValues: enumValues(Object.values(ModerationStatus)),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
      },
      actions: {
        // Edit stays enabled so admins can change moderationStatus, but a raw
        // insert or delete would desync Recipe.commentCount, which is
        // maintained transactionally only inside the comment use cases.
        new: { isAccessible: false },
        // Overrides the default handler (not `isAccessible: false`, unlike
        // new/bulkDelete): this runs DeleteCommentUseCase.softDelete + its
        // notification cleanup, via executeAsAdmin — the entry point that
        // skips the author/owner-only guard that use case otherwise enforces.
        delete: { handler: createCommentDeleteHandler(deleteCommentUseCase) },
        bulkDelete: { isAccessible: false },
        approve: {
          actionType: 'record' as const,
          icon: 'Check',
          variant: 'success' as const,
          component: false,
          isVisible: (context: { record?: { params?: Record<string, unknown> } }) =>
            context.record?.params?.moderationStatus !== 'approved',
          handler: createModerationActionHandler(
            (recordId) => moderateCommentUseCase.execute({ commentId: recordId, decision: 'approved' }),
            'Comment approved',
          ),
        },
        reject: {
          actionType: 'record' as const,
          icon: 'X',
          variant: 'danger' as const,
          component: false,
          guard: 'Reject this comment and hide it?',
          isVisible: (context: { record?: { params?: Record<string, unknown> } }) =>
            context.record?.params?.moderationStatus !== 'rejected',
          handler: createModerationActionHandler(
            (recordId) => moderateCommentUseCase.execute({ commentId: recordId, decision: 'rejected' }),
            'Comment rejected',
          ),
        },
      },
    },
  };

  // Fully open: Comment has no stored like counter (likeCount in
  // CommentWithAuthor is a live `_count` join — see PrismaCommentRepository).
  const commentLikeResource = {
    resource: { model: getModelByName('CommentLike'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'ThumbsUp' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['comment', 'user', 'createdAt'],
      filterProperties: ['commentId', 'userId', 'createdAt'],
      properties: {
        ...userRefProperty('user'),
        ...commentRefProperty('comment'),
        commentId: fk(),
        userId: fk(),
      },
    },
  };

  // Fully open: follower/following counts on a profile are `.count()`
  // queries against this table at read time, not stored columns.
  const userFollowResource = {
    resource: { model: getModelByName('UserFollow'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'Users' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['follower', 'following', 'createdAt'],
      filterProperties: ['followerId', 'followingId', 'createdAt'],
      properties: {
        ...userRefProperty('follower'),
        ...userRefProperty('following'),
        followerId: fk(),
        followingId: fk(),
      },
    },
  };

  // Open edit + delete (new stays closed — a fabricated notification has no
  // real event behind it). No counters depend on this table, and the push (if
  // any) was already sent asynchronously at create time.
  const notificationResource = {
    resource: { model: getModelByName('Notification'), client: prisma },
    options: {
      navigation: { name: 'Social', icon: 'Bell' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['type', 'recipient', 'sender', 'read', 'createdAt'],
      filterProperties: ['recipientId', 'senderId', 'recipeId', 'commentId', 'type', 'read', 'createdAt'],
      properties: {
        ...recipeRefProperty,
        ...userRefProperty('recipient'),
        ...userRefProperty('sender'),
        ...commentRefProperty('comment'),
        recipientId: fk(),
        senderId: fk(),
        recipeId: fk(),
        commentId: fk(),
      },
      actions: { new: { isAccessible: false } },
    },
  };

  // Fully open: a draft is one user's work-in-progress with no counters or
  // invariants riding on it — worst case an admin edit corrupts that one draft.
  const recipeDraftResource = {
    resource: { model: getModelByName('RecipeDraft'), client: prisma },
    options: {
      navigation: { name: 'Content', icon: 'Edit' },
      sort: { sortBy: 'updatedAt', direction: 'desc' as const },
      listProperties: ['prompt', 'owner', 'updatedAt'],
      filterProperties: ['ownerId', 'updatedAt'],
      properties: { ...userRefProperty('owner'), ownerId: fk() },
    },
  };

  const aiGenerationLogResource = {
    resource: { model: getModelByName('AIGenerationLog'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Cpu' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['user', 'recipe', 'provider', 'status', 'createdAt'],
      filterProperties: ['userId', 'generatedRecipeId', 'provider', 'status', 'createdAt'],
      properties: {
        ...recipeRefProperty,
        ...userRefProperty('user'),
        userId: fk(),
        generatedRecipeId: fk(),
      },
      actions: { ...readOnlyActions },
    },
  };

  // Account lifecycle audit trail. Deletion is a tombstone, so this is the only
  // place the deletion (and any later re-registration of the same address) can be
  // seen — a log nobody can read is not an audit trail. Read-only by definition.
  // No relation field exists here by design (see the model comment), so there
  // is no RefCell / raw-FK pair to reconcile — userId stays a plain filterable
  // column.
  const accountEventLogResource = {
    resource: { model: getModelByName('AccountEventLog'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Shield' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['event', 'userId', 'actorId', 'reason', 'emailHash', 'createdAt'],
      filterProperties: ['event', 'userId', 'actorId', 'emailHash', 'createdAt'],
      properties: {
        event: { components: { list: 'EnumLabel', show: 'EnumLabel' } },
      },
      // bulkDelete too: blocking single delete alone still leaves the list
      // view able to erase the audit trail in one gesture.
      actions: { ...readOnlyActions, delete: { isAccessible: false }, bulkDelete: { isAccessible: false } },
    },
  };

  // Delete only: `token` is a live push credential, so letting an admin set
  // one would grant push access to someone else's account. Deleting merely
  // stops delivery to that device, which is safe.
  const fcmTokenResource = {
    resource: { model: getModelByName('FcmToken'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Smartphone' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['user', 'platform', 'createdAt'],
      filterProperties: ['userId', 'platform', 'createdAt'],
      properties: { ...userRefProperty('user'), userId: fk() },
      actions: { ...readOnlyActions },
    },
  };

  // Login-device audit trail. Read-only: it exists for anti-fraud/support
  // lookups, not for admins to edit history.
  const deviceResource = {
    resource: { model: getModelByName('Device'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Smartphone' },
      sort: { sortBy: 'lastLoginAt', direction: 'desc' as const },
      listProperties: ['user', 'platform', 'ipAddress', 'lastLoginAt'],
      filterProperties: ['userId', 'deviceId', 'platform', 'lastLoginAt'],
      properties: { ...userRefProperty('user'), userId: fk() },
      actions: { ...readOnlyActions },
    },
  };

  // Delete only: editing `expiresAt`/`usedAt` back to a valid state would be
  // an account-takeover replay vector, so new/edit stay blocked. Delete
  // (revoke) is safe. `token` is the live reset credential (raw random bytes,
  // not a hash) — an admin who could read it could take over any account
  // inside the 1h window, so it is hidden everywhere; expiry/usage is
  // inspectable via the other columns.
  const passwordResetTokenResource = {
    resource: { model: getModelByName('PasswordResetToken'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Key' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['user', 'expiresAt', 'usedAt', 'createdAt'],
      filterProperties: ['userId', 'expiresAt', 'usedAt', 'createdAt'],
      properties: {
        token: { isVisible: false },
        ...userRefProperty('user'),
        userId: fk(),
      },
      actions: { ...readOnlyActions },
    },
  };

  // Open edit + delete — useful for support (e.g. re-arming an expiry). New
  // stays closed: a fabricated pending signup has no verification code the
  // user actually received. passwordHash/codeHash are bcrypt digests, not
  // usable credentials, but hiding them follows least-privilege and matches
  // how User.passwordHash is handled.
  const pendingRegistrationResource = {
    resource: { model: getModelByName('PendingRegistration'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'UserPlus' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['email', 'displayName', 'attempts', 'expiresAt', 'createdAt'],
      filterProperties: ['email', 'expiresAt', 'createdAt'],
      properties: {
        passwordHash: { isVisible: false },
        codeHash: { isVisible: false },
      },
      actions: { new: { isAccessible: false } },
    },
  };

  const feedbackResource = {
    resource: { model: getModelByName('Feedback'), client: prisma },
    options: {
      navigation: { name: 'Support', icon: 'HelpCircle' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['category', 'subject', 'status', 'user', 'createdAt'],
      filterProperties: ['category', 'status', 'userId'],
      showProperties: [
        'id',
        'user',
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
        ...userRefProperty('user'),
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

  // Background import-job queue (yt-dlp + Groq, claimed with SELECT ... FOR
  // UPDATE SKIP LOCKED). Read-only: status/claimedBy/attempts are managed by
  // the worker's claim loop, and hand-editing them would desync a live claim.
  const importJobResource = {
    resource: { model: getModelByName('ImportJob'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Download' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['owner', 'status', 'attempts', 'claimedBy', 'createdAt'],
      filterProperties: ['ownerId', 'status', 'createdAt'],
      properties: { ...userRefProperty('owner'), ownerId: fk() },
      actions: { ...readOnlyActions },
    },
  };

  // One row per user per day of voice-assistant use. Read-only: seconds and
  // sessions are charged by the assistant's own heartbeat, not something an
  // admin hand-edits.
  const assistantUsageResource = {
    resource: { model: getModelByName('AssistantUsage'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'Mic' },
      sort: { sortBy: 'day', direction: 'desc' as const },
      listProperties: ['user', 'day', 'seconds', 'sessions'],
      filterProperties: ['userId', 'day'],
      properties: {
        ...userRefProperty('user'),
        userId: fk(),
        day: { components: { list: 'DayCell', show: 'DayCell' } },
      },
      actions: { ...readOnlyActions },
    },
  };

  // loginPath/logoutPath must be derived from rootPath, not left to AdminJS's
  // defaults. The defaults are the literal strings '/admin/login' and
  // '/admin/logout', and @adminjs/express computes the router-relative route as
  // `loginPath.replace(rootPath, '')` — so with rootPath '/' the default
  // '/admin/login' does NOT contain '/admin' as a *prefix to strip* the way it
  // does under rootPath '/admin', and login would stay served at '/admin/login'
  // even though the panel now lives at '/'. Setting them explicitly keeps login
  // under the configured root (and lets the rate limiter in app.ts read
  // admin.options.loginPath back instead of recomputing it and drifting).
  const base = rootPath === '/' ? '' : rootPath;

  return new AdminJS({
    componentLoader: buildComponentLoader(),
    rootPath,
    loginPath: `${base}/login`,
    logoutPath: `${base}/logout`,
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
      accountEventLogResource,
      fcmTokenResource,
      deviceResource,
      passwordResetTokenResource,
      pendingRegistrationResource,
      feedbackResource,
      featureFlagResource,
      importJobResource,
      assistantUsageResource,
    ],
    dashboard: {
      handler: buildDashboardHandler(prisma),
      component: 'Dashboard',
    },
    branding: {
      companyName: 'Recipely Admin',
      withMadeWithLove: false,
      theme: DARK_BLUE_THEME,
    },
    env: {
      AVAILABLE_LANGUAGES: SUPPORTED_LOCALES.join(','),
      BASE_URL: baseUrl,
    },
  });
}
