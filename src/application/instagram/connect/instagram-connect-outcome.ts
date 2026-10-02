/**
 * How a connect ended, as the callback reports it to the app (query
 * parameters on the return link). `creatorTag` says what happened to the
 * Instagram creator tag: `approved` (now verified), `taken` (another user
 * holds this handle approved), `invalid` (the username breaks the handle rules).
 */
export const InstagramConnectError = {
  /** The user declined on instagram.com. */
  Denied: 'denied',
  /** Exchanging the code or reading the account failed. */
  Failed: 'failed',
  /** That Instagram account is linked to another Recipely user. */
  AccountLinked: 'account_linked',
} as const;

export type InstagramConnectErrorType = (typeof InstagramConnectError)[keyof typeof InstagramConnectError];

export const CreatorTagOutcome = {
  Approved: 'approved',
  Taken: 'taken',
  Invalid: 'invalid',
} as const;

export type CreatorTagOutcomeType = (typeof CreatorTagOutcome)[keyof typeof CreatorTagOutcome];
