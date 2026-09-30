import { ValidationFailure } from '@core/failure';
import { fail } from '@core/result/result';
import { CreatorStatus } from '@domain/users/creator-status';
import { CreatorTag } from '@domain/users/creator-tag';
import { CreatorHandle } from '@domain/users/creator-handle';
import { isCreatorPlatform } from '@domain/users/creator-platform';
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
  warnUnreadableClaim(row.id, row.creatorPlatform, restored.failure, row.creatorStatus);
  return null;
}

/**
 * **A creators-list row's platform + handle, or `null`.**
 *
 * @remarks
 * - The same check `creatorTagFromRow` makes, so the Explore strip and the
 *   profile page agree on who has a readable claim, and on its normalised
 *   spelling. A row that fails is logged the same way and left out.
 */
export function creatorHandleFromRow(row: { readonly id: string; readonly platform: string; readonly handle: string }): CreatorHandle | null {
  const handle = isCreatorPlatform(row.platform)
    ? CreatorHandle.create(row.platform, row.handle)
    : fail(new ValidationFailure('errors.validation.creator_handle', 'creatorPlatform'));
  if (handle.ok) return handle.value;
  warnUnreadableClaim(row.id, row.platform, handle.failure);
  return null;
}

function warnUnreadableClaim(userId: string, creatorPlatform: string | null, failure: ValidationFailure, creatorStatus?: string): void {
  logger.warn(
    {
      userId,
      creatorPlatform,
      ...(creatorStatus !== undefined ? { creatorStatus } : {}),
      messageKey: failure.messageKey,
      field: failure.field,
    },
    'creator_claim_unreadable',
  );
}
