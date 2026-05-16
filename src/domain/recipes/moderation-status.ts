export const ModerationStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;

export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];

export const isModerationStatus = (v: unknown): v is ModerationStatus =>
  v === ModerationStatus.Pending || v === ModerationStatus.Approved || v === ModerationStatus.Rejected;
