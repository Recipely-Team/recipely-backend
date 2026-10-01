/**
 * The groups of the diary food search, in the order the screen lists them.
 * Spelled the same on the wire (`?group=`).
 */
export const DiaryFoodGroup = {
  Saved: 'saved',
  Mine: 'mine',
  Products: 'products',
  Recipes: 'recipes',
} as const;

export type DiaryFoodGroupType = (typeof DiaryFoodGroup)[keyof typeof DiaryFoodGroup];

/** The groups that are recipes (everything but products). */
export type DiaryRecipeGroupType = Exclude<DiaryFoodGroupType, typeof DiaryFoodGroup.Products>;

export const DIARY_FOOD_GROUPS = Object.values(DiaryFoodGroup) as [DiaryFoodGroupType, ...DiaryFoodGroupType[]];
