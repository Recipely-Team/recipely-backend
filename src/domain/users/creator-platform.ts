/**
 * The social platforms a creator can claim an account on.
 *
 * Stored in `users.creator_platform` and spelled the same in the app's
 * contract (`docs/creator-tag-contract.md`), so a value added here is a
 * change on both sides of the wire.
 */
export const CreatorPlatform = {
  Instagram: 'instagram',
  TikTok: 'tiktok',
} as const;

export type CreatorPlatform = (typeof CreatorPlatform)[keyof typeof CreatorPlatform];

export const isCreatorPlatform = (v: unknown): v is CreatorPlatform =>
  (Object.values(CreatorPlatform) as unknown[]).includes(v);
