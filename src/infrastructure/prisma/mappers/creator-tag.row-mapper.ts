import type { CreatorTag as CreatorTagRow } from '@prisma/client';
import { ValidationFailure } from '@core/failure';
import { fail } from '@core/result/result';
import { CreatorTag } from '@domain/users/creator-tag';
import { CreatorHandle } from '@domain/users/creator-handle';
import { isCreatorPlatform } from '@domain/users/creator-platform';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/** Loads a user's `creator_tags` rows with it, in the order every view shows them. */
export const WITH_CREATOR_TAGS = { creatorTags: { orderBy: { platform: 'asc' } } } as const;

/**
 * **A user's `creator_tags` rows → its claims.**
 *
 * @remarks
 * - `CreatorTag.restore` re-validates each stored handle. A claim stored under
 *   rules that have since tightened (or edited by hand) must not take the
 *   whole user down with it — that would break login and `/me` — so it is
 *   left out and logged for someone to look at. The owner can then simply
 *   claim that platform again; the other platform's tag is unaffected.
 */
export function creatorTagsFromRows(rows: readonly CreatorTagRow[]): CreatorTag[] {
  return rows.flatMap((row): CreatorTag[] => {
    const restored = CreatorTag.restore(row);
    if (restored.ok) return [restored.value];
    warnUnreadableClaim(row.userId, row.platform, restored.failure, row.status);
    return [];
  });
}

/**
 * **A creators-list tag's platform + handle, or `null`.**
 *
 * @remarks
 * - The same check `creatorTagsFromRows` makes, so the Explore strip and the
 *   profile page agree on which claims are readable, and on their normalised
 *   spelling. A tag that fails is logged the same way and left out.
 */
export function creatorHandleFromRow(userId: string, tag: { readonly platform: string; readonly handle: string }): CreatorHandle | null {
  const handle = isCreatorPlatform(tag.platform)
    ? CreatorHandle.create(tag.platform, tag.handle)
    : fail(new ValidationFailure('errors.validation.creator_handle', 'platform'));
  if (handle.ok) return handle.value;
  warnUnreadableClaim(userId, tag.platform, handle.failure);
  return null;
}

function warnUnreadableClaim(userId: string, creatorPlatform: string, failure: ValidationFailure, creatorStatus?: string): void {
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
