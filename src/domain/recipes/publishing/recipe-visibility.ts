/**
 * Whether a recipe is meant for its owner alone or for everyone.
 *
 * @remarks
 * - **The owner's intent, not the moderator's verdict.** `isPublished` is the
 *   outcome of both — a recipe the owner wants public still stays hidden until
 *   moderation approves it. This is only what they asked for.
 * - **Private is where every recipe starts** in the app that knows about it:
 *   saving and publishing are separate steps, so nothing reaches the feed
 *   without a deliberate act. A client that sends nothing is an older build,
 *   and for it `Public` keeps the behaviour it was written against.
 */
export const RecipeVisibility = {
  Private: 'private',
  Public: 'public',
} as const;

export type RecipeVisibilityType = (typeof RecipeVisibility)[keyof typeof RecipeVisibility];
