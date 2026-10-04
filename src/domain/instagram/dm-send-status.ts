/** How a private reply attempt ended. Stored in `dm_sends.status`. */
export const DmSendStatus = {
  /** Claimed by the worker, not yet answered by Instagram. */
  Pending: 'pending',
  Sent: 'sent',
  Failed: 'failed',
} as const;

export type DmSendStatusType = (typeof DmSendStatus)[keyof typeof DmSendStatus];

export const isDmSendStatus = (v: unknown): v is DmSendStatusType =>
  (Object.values(DmSendStatus) as unknown[]).includes(v);
