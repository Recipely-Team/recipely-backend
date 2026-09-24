export const ModerationStatus = {
  /**
   * Saved privately and never submitted. Not a verdict: nothing has looked at
   * it, and nothing should — keeping it apart from `Pending` keeps the admin
   * review queue to recipes someone actually asked to publish.
   */
  Unreviewed: 'unreviewed',
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;

export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];

export const isModerationStatus = (v: unknown): v is ModerationStatus =>
  (Object.values(ModerationStatus) as unknown[]).includes(v);
