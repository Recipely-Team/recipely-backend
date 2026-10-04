/** One post or Reel of the connected account (`GET /me/instagram/media`). */
export interface InstagramMediaDto {
  readonly id: string;
  /** IMAGE | VIDEO | CAROUSEL_ALBUM. */
  readonly mediaType: string;
  readonly thumbnailUrl: string | null;
  readonly caption: string | null;
  readonly permalink: string | null;
  /** ISO time it was posted. */
  readonly timestamp: string | null;
}
