/**
 * Why a private reply was not sent. Stored in `dm_sends.reason`; the app words
 * each one for the creator's activity list.
 */
export const DmSendReason = {
  /** Instagram allows a private reply only within 7 days of the comment. */
  TooOld: 'too_old',
  /** The rule's recipe was deleted or is no longer readable by others. */
  RecipeUnavailable: 'recipe_unavailable',
  /** The creator disconnected Instagram, or the token expired or was revoked. */
  NotConnected: 'not_connected',
  /** Instagram kept refusing for rate limits after every retry. */
  RateLimited: 'rate_limited',
  /** The commenter cannot be messaged (blocked the account, restricted messages, gone). */
  RecipientUnavailable: 'recipient_unavailable',
  /** Any other refusal; the detail is in the server log. */
  Upstream: 'upstream_error',
} as const;

export type DmSendReasonType = (typeof DmSendReason)[keyof typeof DmSendReason];
