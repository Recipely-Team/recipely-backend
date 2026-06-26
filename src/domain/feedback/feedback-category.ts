export const FeedbackCategory = {
  Bug: 'bug',
  Suggestion: 'suggestion',
  Help: 'help',
  Other: 'other',
} as const;

export type FeedbackCategory = (typeof FeedbackCategory)[keyof typeof FeedbackCategory];

export const isFeedbackCategory = (v: unknown): v is FeedbackCategory =>
  v === FeedbackCategory.Bug ||
  v === FeedbackCategory.Suggestion ||
  v === FeedbackCategory.Help ||
  v === FeedbackCategory.Other;
