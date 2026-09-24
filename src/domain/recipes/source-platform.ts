/**
 * Which video platform an imported recipe was lifted from.
 *
 * @remarks
 * - **Separate from `RecipeOrigin` because they answer different questions.**
 *   One enum could only answer one of them at a time, and an import is both
 *   facts at once: the video came from an account, and a model turned it into
 *   structured text. Asking a reader to choose between "AI" and "IMPORT" was
 *   asking them to drop half of what happened.
 * - **`null` when nothing was imported**, which is most recipes. A platform on
 *   a recipe someone typed out would be a claim about a post that never
 *   existed.
 * - **The set grows.** yt-dlp is what fetches these and it is indifferent to
 *   which one; adding a platform is a host in the allowlist and a name here,
 *   not a new pipeline.
 */
export const SourcePlatform = {
  Instagram: 'INSTAGRAM',
  TikTok: 'TIKTOK',
} as const;

export type SourcePlatformType = (typeof SourcePlatform)[keyof typeof SourcePlatform];
