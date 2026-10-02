/** Where a queued webhook change stands. Stored in `instagram_events.status`. */
export const InstagramEventStatus = {
  Queued: 'queued',
  Done: 'done',
  Failed: 'failed',
} as const;

export type InstagramEventStatusType = (typeof InstagramEventStatus)[keyof typeof InstagramEventStatus];
