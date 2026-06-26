export const FeedbackStatus = {
  New: 'new',
  InProgress: 'in_progress',
  Resolved: 'resolved',
} as const;

export type FeedbackStatus = (typeof FeedbackStatus)[keyof typeof FeedbackStatus];

export const isFeedbackStatus = (v: unknown): v is FeedbackStatus =>
  v === FeedbackStatus.New ||
  v === FeedbackStatus.InProgress ||
  v === FeedbackStatus.Resolved;
