import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/** One post or Reel of the connected account. */
export interface InstagramMediaData {
  readonly id: string;
  /** IMAGE | VIDEO | CAROUSEL_ALBUM, as Instagram names them. */
  readonly mediaType: string;
  /** The picture to show: a video's thumbnail, otherwise the media itself. */
  readonly thumbnailUrl: string | null;
  readonly caption: string | null;
  readonly permalink: string | null;
  readonly timestamp: Date | null;
}

export interface InstagramTokenData {
  readonly accessToken: string;
  /** Seconds the token lives, as Instagram answered. */
  readonly expiresInSeconds: number;
}

export interface InstagramProfileData {
  /** The professional account id (`user_id`) webhooks and messages use. */
  readonly igUserId: string;
  /** The app-scoped id (`id`). */
  readonly appScopedId: string | null;
  readonly username: string;
  readonly mediaCount: number;
}

export interface InstagramMediaPage {
  readonly items: InstagramMediaData[];
  /** The cursor for the next page; `null` on the last. */
  readonly after: string | null;
}

/**
 * **The Instagram API with Instagram Login**, as the automations use it.
 *
 * @remarks
 * - Failures carry what the caller acts on: `TooManyRequestsFailure` for a
 *   rate limit (retry later), `UnauthorizedFailure` for a token Instagram no
 *   longer accepts (Graph codes 190/102/463/467 — the connection expires),
 *   `ForbiddenFailure` for a permission the user did not grant (reconnect to
 *   grant it; the connection stays), `UnprocessableFailure` for a recipient
 *   that cannot be messaged, `ServiceUnavailableFailure` for the rest.
 *   Nothing throws.
 */
export interface InstagramGraphInterface {
  /** The instagram.com consent page, carrying `state`. */
  authorizeUrl(state: string): string;
  /** Code → short-lived token, and the account it is for. */
  exchangeCode(code: string): Promise<Result<{ readonly accessToken: string }, Failure>>;
  /** Short-lived → long-lived (~60 days). */
  longLived(shortToken: string): Promise<Result<InstagramTokenData, Failure>>;
  refresh(token: string): Promise<Result<InstagramTokenData, Failure>>;
  profile(token: string): Promise<Result<InstagramProfileData, Failure>>;
  /** Turns on comment webhooks for the account. */
  subscribeWebhooks(token: string): Promise<Result<void, Failure>>;
  listMedia(token: string, limit: number, after: string | null): Promise<Result<InstagramMediaPage, Failure>>;
  /** One of the account's posts; `null` when it is not theirs or gone. */
  findMedia(token: string, mediaId: string): Promise<Result<InstagramMediaData | null, Failure>>;
  /** A private reply to a comment — one per comment, within 7 days of it. */
  sendPrivateReply(igUserId: string, token: string, commentId: string, text: string): Promise<Result<void, Failure>>;
  /** A public reply under the comment. */
  replyToComment(token: string, commentId: string, text: string): Promise<Result<void, Failure>>;
}
