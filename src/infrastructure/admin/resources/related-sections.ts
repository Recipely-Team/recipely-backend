// What the "Related" tab shows on each record's page — the child rows that
// belong to it, newest first, ten per section with a link to the full filtered
// list. Rendered by components/related-records-panel.tsx, which reads these
// through the action's `custom.sections`.
//
// `filterKey` must be a filterable column of `resourceId` (an fk() column or a
// plain scalar), and `sortBy` a column it has.

interface RelatedColumn {
  readonly key: string;
  readonly label: string;
  readonly localized?: boolean;
  readonly populatedPath?: string;
  readonly populatedLabel?: string;
  readonly truncate?: number;
  readonly boolean?: boolean;
}

interface RelatedSection {
  readonly title: string;
  readonly resourceId: string;
  readonly filterKey: string;
  readonly sortBy: string;
  readonly direction?: 'asc' | 'desc';
  readonly columns: readonly RelatedColumn[];
}

/** Rows each section shows before its "View all" link to the filtered list. */
const RELATED_PAGE_SIZE = 10;

const created = { key: 'createdAt', label: 'Created' };
const recipeCol = { key: 'recipe', label: 'Recipe', populatedPath: 'recipe', truncate: 50 };
const userCol = (path: string, label: string) => ({
  key: path,
  label,
  populatedPath: path,
  populatedLabel: 'displayName',
});

const USER_SECTIONS: readonly RelatedSection[] = [
  {
    title: 'Recipes',
    resourceId: 'Recipe',
    filterKey: 'ownerId',
    sortBy: 'createdAt',
    columns: [
      { key: 'name', label: 'Name', localized: true, truncate: 50 },
      { key: 'origin', label: 'Origin' },
      { key: 'isPublished', label: 'Published', boolean: true },
      { key: 'moderationStatus', label: 'Moderation' },
      created,
    ],
  },
  {
    title: 'Comments',
    resourceId: 'Comment',
    filterKey: 'authorId',
    sortBy: 'createdAt',
    columns: [
      { key: 'body', label: 'Body', truncate: 80 },
      recipeCol,
      { key: 'rating', label: 'Rating' },
      { key: 'moderationStatus', label: 'Moderation' },
      created,
    ],
  },
  { title: 'Favorites', resourceId: 'Favorite', filterKey: 'userId', sortBy: 'createdAt', columns: [recipeCol, created] },
  { title: 'Likes', resourceId: 'RecipeLike', filterKey: 'userId', sortBy: 'createdAt', columns: [recipeCol, created] },
  {
    title: 'Followers',
    resourceId: 'UserFollow',
    filterKey: 'followingId',
    sortBy: 'createdAt',
    columns: [userCol('follower', 'Follower'), created],
  },
  {
    title: 'Following',
    resourceId: 'UserFollow',
    filterKey: 'followerId',
    sortBy: 'createdAt',
    columns: [userCol('following', 'Following'), created],
  },
  {
    title: 'Drafts',
    resourceId: 'RecipeDraft',
    filterKey: 'ownerId',
    sortBy: 'updatedAt',
    columns: [{ key: 'prompt', label: 'Prompt', truncate: 80 }, { key: 'updatedAt', label: 'Updated' }],
  },
  {
    title: 'Import jobs',
    resourceId: 'ImportJob',
    filterKey: 'ownerId',
    sortBy: 'createdAt',
    columns: [
      { key: 'url', label: 'URL', truncate: 60 },
      { key: 'sourcePlatform', label: 'Platform' },
      { key: 'status', label: 'Status' },
      { key: 'errorKey', label: 'Error' },
      created,
    ],
  },
  {
    title: 'AI generations',
    resourceId: 'AIGenerationLog',
    filterKey: 'userId',
    sortBy: 'createdAt',
    columns: [
      { key: 'userPrompt', label: 'Prompt', truncate: 60 },
      { key: 'provider', label: 'Provider' },
      { key: 'modelUsed', label: 'Model' },
      { key: 'status', label: 'Status' },
      created,
    ],
  },
  {
    title: 'Food diary',
    resourceId: 'FoodLogEntry',
    filterKey: 'userId',
    sortBy: 'createdAt',
    columns: [
      { key: 'date', label: 'Day' },
      { key: 'meal', label: 'Meal' },
      { key: 'name', label: 'Food', truncate: 40 },
      { key: 'servings', label: 'Servings' },
      { key: 'calories', label: 'kcal' },
    ],
  },
  {
    title: 'Water',
    resourceId: 'DiaryDayWater',
    filterKey: 'userId',
    sortBy: 'date',
    columns: [{ key: 'date', label: 'Day' }, { key: 'glasses', label: 'Glasses' }],
  },
  {
    title: 'Nutrition goals',
    resourceId: 'NutritionGoals',
    filterKey: 'userId',
    sortBy: 'updatedAt',
    columns: [
      { key: 'calories', label: 'kcal' },
      { key: 'protein', label: 'Protein' },
      { key: 'carbs', label: 'Carbs' },
      { key: 'fat', label: 'Fat' },
      { key: 'fiber', label: 'Fiber' },
      { key: 'waterGlasses', label: 'Water' },
    ],
  },
  {
    title: 'Notifications received',
    resourceId: 'Notification',
    filterKey: 'recipientId',
    sortBy: 'createdAt',
    columns: [
      { key: 'type', label: 'Type' },
      userCol('sender', 'From'),
      { key: 'message', label: 'Message', truncate: 60 },
      { key: 'read', label: 'Read', boolean: true },
      created,
    ],
  },
  {
    title: 'Assistant usage',
    resourceId: 'AssistantUsage',
    filterKey: 'userId',
    sortBy: 'day',
    columns: [{ key: 'day', label: 'Day' }, { key: 'seconds', label: 'Seconds' }, { key: 'sessions', label: 'Sessions' }],
  },
  {
    title: 'Creator tags',
    resourceId: 'CreatorTag',
    filterKey: 'userId',
    sortBy: 'requestedAt',
    columns: [
      { key: 'platform', label: 'Platform' },
      { key: 'handle', label: 'Handle' },
      { key: 'status', label: 'Status' },
      { key: 'requestedAt', label: 'Requested' },
    ],
  },
  {
    title: 'Instagram connection',
    resourceId: 'InstagramConnection',
    filterKey: 'userId',
    sortBy: 'connectedAt',
    columns: [
      { key: 'username', label: 'Username' },
      { key: 'status', label: 'Status' },
      { key: 'tokenExpiresAt', label: 'Token expires' },
      { key: 'connectedAt', label: 'Connected' },
    ],
  },
  {
    title: 'DM rules',
    resourceId: 'DmRule',
    filterKey: 'userId',
    sortBy: 'createdAt',
    columns: [
      { key: 'mediaCaption', label: 'Post', truncate: 50 },
      { key: 'keywords', label: 'Keywords' },
      recipeCol,
      { key: 'enabled', label: 'Enabled', boolean: true },
    ],
  },
  {
    title: 'Devices',
    resourceId: 'Device',
    filterKey: 'userId',
    sortBy: 'lastLoginAt',
    columns: [
      { key: 'platform', label: 'Platform' },
      { key: 'appVersion', label: 'App version' },
      { key: 'ipAddress', label: 'IP' },
      { key: 'lastLoginAt', label: 'Last login' },
    ],
  },
  {
    title: 'Feedback',
    resourceId: 'Feedback',
    filterKey: 'userId',
    sortBy: 'createdAt',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Status' },
      { key: 'subject', label: 'Subject', truncate: 60 },
      created,
    ],
  },
  {
    title: 'Account events',
    resourceId: 'AccountEventLog',
    filterKey: 'userId',
    sortBy: 'createdAt',
    columns: [{ key: 'event', label: 'Event' }, { key: 'reason', label: 'Reason', truncate: 60 }, created],
  },
];

const RECIPE_SECTIONS: readonly RelatedSection[] = [
  {
    title: 'Comments',
    resourceId: 'Comment',
    filterKey: 'recipeId',
    sortBy: 'createdAt',
    columns: [
      { key: 'body', label: 'Body', truncate: 80 },
      userCol('author', 'Author'),
      { key: 'rating', label: 'Rating' },
      { key: 'moderationStatus', label: 'Moderation' },
      created,
    ],
  },
  { title: 'Likes', resourceId: 'RecipeLike', filterKey: 'recipeId', sortBy: 'createdAt', columns: [userCol('user', 'User'), created] },
  { title: 'Favorites', resourceId: 'Favorite', filterKey: 'recipeId', sortBy: 'createdAt', columns: [userCol('user', 'User'), created] },
  {
    title: 'Media',
    resourceId: 'RecipeMedia',
    filterKey: 'recipeId',
    sortBy: 'position', direction: 'asc',
    columns: [{ key: 'type', label: 'Type' }, { key: 'position', label: 'Position' }, { key: 'url', label: 'URL', truncate: 60 }],
  },
  {
    title: 'AI generations',
    resourceId: 'AIGenerationLog',
    filterKey: 'generatedRecipeId',
    sortBy: 'createdAt',
    columns: [
      userCol('user', 'User'),
      { key: 'userPrompt', label: 'Prompt', truncate: 60 },
      { key: 'provider', label: 'Provider' },
      { key: 'modelUsed', label: 'Model' },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    title: 'Diary entries',
    resourceId: 'FoodLogEntry',
    filterKey: 'recipeId',
    sortBy: 'createdAt',
    columns: [userCol('user', 'User'), { key: 'date', label: 'Day' }, { key: 'servings', label: 'Servings' }, { key: 'calories', label: 'kcal' }],
  },
  {
    title: 'DM rules',
    resourceId: 'DmRule',
    filterKey: 'recipeId',
    sortBy: 'createdAt',
    columns: [userCol('user', 'Owner'), { key: 'keywords', label: 'Keywords' }, { key: 'enabled', label: 'Enabled', boolean: true }],
  },
  {
    title: 'Notifications',
    resourceId: 'Notification',
    filterKey: 'recipeId',
    sortBy: 'createdAt',
    columns: [{ key: 'type', label: 'Type' }, userCol('recipient', 'To'), userCol('sender', 'From'), created],
  },
];

const COMMENT_SECTIONS: readonly RelatedSection[] = [
  { title: 'Likes', resourceId: 'CommentLike', filterKey: 'commentId', sortBy: 'createdAt', columns: [userCol('user', 'User'), created] },
  {
    title: 'Notifications',
    resourceId: 'Notification',
    filterKey: 'commentId',
    sortBy: 'createdAt',
    columns: [{ key: 'type', label: 'Type' }, userCol('recipient', 'To'), { key: 'read', label: 'Read', boolean: true }, created],
  },
];

const FOOD_CATEGORY_SECTIONS: readonly RelatedSection[] = [
  {
    title: 'Foods',
    resourceId: 'Food',
    filterKey: 'category',
    sortBy: 'rank', direction: 'asc',
    columns: [{ key: 'slug', label: 'Slug' }, { key: 'names', label: 'Name', localized: true }, { key: 'defaultUnit', label: 'Unit' }],
  },
];

const FOOD_SECTIONS: readonly RelatedSection[] = [
  {
    title: 'Variants',
    resourceId: 'FoodVariant',
    filterKey: 'foodId',
    sortBy: 'position', direction: 'asc',
    columns: [
      { key: 'key', label: 'Key' },
      { key: 'names', label: 'Name', localized: true },
      { key: 'kcal', label: 'kcal' },
      { key: 'protein', label: 'Protein' },
      { key: 'carbs', label: 'Carbs' },
      { key: 'fat', label: 'Fat' },
      { key: 'source', label: 'Source' },
    ],
  },
];

const FOOD_VARIANT_SECTIONS: readonly RelatedSection[] = [
  {
    title: 'Diary entries',
    resourceId: 'FoodLogEntry',
    filterKey: 'foodVariantId',
    sortBy: 'createdAt',
    columns: [userCol('user', 'User'), { key: 'date', label: 'Day' }, { key: 'servings', label: 'Servings' }, { key: 'calories', label: 'kcal' }],
  },
];

const DM_RULE_SECTIONS: readonly RelatedSection[] = [
  {
    title: 'Sends',
    resourceId: 'DmSend',
    filterKey: 'ruleId',
    sortBy: 'createdAt',
    columns: [
      { key: 'commenterUsername', label: 'Commenter' },
      { key: 'commentText', label: 'Comment', truncate: 60 },
      { key: 'status', label: 'Status' },
      { key: 'reason', label: 'Reason' },
      { key: 'sentAt', label: 'Sent' },
    ],
  },
];

/** The "Related" record action for a resource — a tab beside Show/Edit/Delete. */
export function relatedAction(sections: readonly RelatedSection[]) {
  return {
    actionType: 'record' as const,
    icon: 'Layers',
    component: 'RelatedRecordsPanel',
    custom: { sections, pageSize: RELATED_PAGE_SIZE },
    // The component fetches its own sections; the handler only has to return
    // the record so the tab loads. The strip-secrets after-hook covers it like
    // every other action (strip-secrets-from-resources.ts).
    handler: async (
      _request: unknown,
      _response: unknown,
      context: { record?: { toJSON: (currentAdmin?: unknown) => unknown }; currentAdmin?: unknown },
    ) => ({ record: context.record?.toJSON(context.currentAdmin) }),
  };
}

export const RelatedSections = {
  user: USER_SECTIONS,
  recipe: RECIPE_SECTIONS,
  comment: COMMENT_SECTIONS,
  foodCategory: FOOD_CATEGORY_SECTIONS,
  food: FOOD_SECTIONS,
  foodVariant: FOOD_VARIANT_SECTIONS,
  dmRule: DM_RULE_SECTIONS,
} as const;
