/**
 * How the OAuth callback ended, as it reports it on the app's return link:
 * `status=authorized&code=…` (finalise with the code) or
 * `status=error&reason=denied|failed`.
 */
export const InstagramCallbackStatus = {
  Authorized: 'authorized',
  Error: 'error',
} as const;

export const InstagramConnectError = {
  /** The user declined on instagram.com. */
  Denied: 'denied',
  /** Exchanging the code or reading the account failed. */
  Failed: 'failed',
} as const;

export type InstagramConnectErrorType = (typeof InstagramConnectError)[keyof typeof InstagramConnectError];

/**
 * What finalising did to the Instagram creator tag: `approved` (now verified
 * with the real username), `taken` (another user holds that handle approved;
 * an admin settles it), `invalid` (the username breaks the handle rules).
 */
export const CreatorTagOutcome = {
  Approved: 'approved',
  Taken: 'taken',
  Invalid: 'invalid',
} as const;

export type CreatorTagOutcomeType = (typeof CreatorTagOutcome)[keyof typeof CreatorTagOutcome];
