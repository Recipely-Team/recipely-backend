/**
 * Where an imported recipe was lifted from: a video platform, or a web page.
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
 * - **The set grows.** yt-dlp fetches most of these and is indifferent to
 *   which one; adding such a platform is a host in the allowlist and a name
 *   here, not a new pipeline. YouTube is the exception: it has its own
 *   importer, because yt-dlp is blocked there.
 */
export const SourcePlatform = {
  Instagram: 'INSTAGRAM',
  TikTok: 'TIKTOK',
  Facebook: 'FACEBOOK',
  /**
   * A YouTube video, read from its title, description and thumbnail through
   * the YouTube Data API — never through yt-dlp, which YouTube refuses from a
   * server ("Sign in to confirm you're not a bot").
   */
  YouTube: 'YOUTUBE',
  /**
   * Any recipe web page, read from its schema.org Recipe markup rather than
   * from a video. Not a platform in the brand sense, but the same question —
   * where did this come from — with the site's host as the handle.
   */
  Web: 'WEB',
} as const;

export type SourcePlatformType = (typeof SourcePlatform)[keyof typeof SourcePlatform];
