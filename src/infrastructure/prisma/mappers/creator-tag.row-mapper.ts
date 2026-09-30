import { CreatorStatus } from '@domain/users/creator-status';
import { CreatorTag } from '@domain/users/creator-tag';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/** The creator columns of a `users` row, as Prisma returns them. */
export interface CreatorColumns {
  readonly id: string;
  readonly creatorStatus: string;
  readonly creatorPlatform: string | null;
  readonly creatorHandle: string | null;
  readonly creatorRequestedAt: Date | null;
  readonly creatorReviewedAt: Date | null;
}

/** "No claim", as column values — what a cleared or tombstoned row holds. */
export const CLEARED_CREATOR_CLAIM = {
  creatorStatus: CreatorStatus.None,
  creatorPlatform: null,
  creatorHandle: null,
  creatorRequestedAt: null,
  creatorReviewedAt: null,
} as const;

/**
 * **A row's creator claim, or `null`.**
 *
 * @remarks
 * - `CreatorTag.restore` re-validates the stored handle. A claim stored under
 *   rules that have since tightened (or edited by hand) must not take the
 *   whole user down with it — that would break login and `/me` — so it reads
 *   as "no claim" and is logged for someone to look at. The owner can then
 *   simply claim again.
 */
export function creatorTagFromRow(row: CreatorColumns): CreatorTag | null {
  const restored = CreatorTag.restore({
    status: row.creatorStatus,
    platform: row.creatorPlatform,
    handle: row.creatorHandle,
    requestedAt: row.creatorRequestedAt,
    reviewedAt: row.creatorReviewedAt,
  });
  if (restored.ok) return restored.value;
  logger.warn(
    { userId: row.id, creatorStatus: row.creatorStatus, creatorPlatform: row.creatorPlatform },
    'creator_claim_unreadable',
  );
  return null;
}
