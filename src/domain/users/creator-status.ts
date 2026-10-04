/**
 * Where a creator claim stands. Stored in `creator_tags.status`.
 *
 * A user with no claim on a platform simply has no row for it. Only `Approved`
 * shows the tag to anyone but the owner.
 */
export const CreatorStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;

export type CreatorStatus = (typeof CreatorStatus)[keyof typeof CreatorStatus];

export const isCreatorStatus = (v: unknown): v is CreatorStatus =>
  (Object.values(CreatorStatus) as unknown[]).includes(v);
