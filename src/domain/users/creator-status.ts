/**
 * Where a user's creator claim stands. Stored in `users.creator_status`.
 *
 * `None` is the column default and means there is no claim at all — every other
 * creator column is null then. Only `Approved` shows the tag to anyone but the
 * owner.
 */
export const CreatorStatus = {
  None: 'none',
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;

export type CreatorStatus = (typeof CreatorStatus)[keyof typeof CreatorStatus];

export const isCreatorStatus = (v: unknown): v is CreatorStatus =>
  (Object.values(CreatorStatus) as unknown[]).includes(v);

/** A status that has a claim behind it — every value but `None`. */
export type ClaimedCreatorStatus = Exclude<CreatorStatus, typeof CreatorStatus.None>;
