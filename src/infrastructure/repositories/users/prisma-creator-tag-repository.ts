import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import { CreatorStatus } from '@domain/users/creator-status';
import type { CreatorTag } from '@domain/users/creator-tag';
import { CLEARED_CREATOR_CLAIM, creatorTagFromRow } from '@infrastructure/prisma/mappers/creator-tag.row-mapper';
import type { CreatorHandle } from '@domain/users/creator-handle';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';

const UNIQUE_VIOLATION = 'P2002';

/**
 * **Creator claim columns on `users`.**
 *
 * @remarks
 * - Every read and write is scoped to `deletedAt: null`; a tombstoned account
 *   is "no such user" here as everywhere else.
 * - A review is written only over the pending claim it was read from.
 * - A unique violation on save can only be the partial index
 *   `users_creator_approved_handle_key` — two approvals of the same handle
 *   racing — and is reported as `creator_handle_taken`.
 */
export class PrismaCreatorTagRepository implements CreatorTagRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<Result<CreatorTag | null, Failure>> {
    try {
      const row = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: {
          id: true,
          creatorStatus: true,
          creatorPlatform: true,
          creatorHandle: true,
          creatorRequestedAt: true,
          creatorReviewedAt: true,
        },
      });
      if (row === null) return fail(new NotFoundFailure('errors.not_found.user'));
      return ok(creatorTagFromRow(row));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async save(userId: string, tag: CreatorTag | null): Promise<Result<void, Failure>> {
    return this.write({ id: userId, deletedAt: null }, tag, new NotFoundFailure('errors.not_found.user'));
  }

  async saveReview(userId: string, reviewed: CreatorTag): Promise<Result<void, Failure>> {
    // Conditional on the claim still being the pending one the review read: a
    // user who changed or withdrew it meanwhile must not have the new claim
    // approved (or their removal undone) by a decision about the old one.
    const stillPending = {
      id: userId,
      deletedAt: null,
      creatorStatus: CreatorStatus.Pending,
      creatorPlatform: reviewed.platform,
      creatorHandle: reviewed.handle,
    };
    return this.write(stillPending, reviewed, new ConflictFailure('errors.conflict.creator_not_pending'));
  }

  private async write(
    where: Prisma.UserWhereInput,
    tag: CreatorTag | null,
    noMatch: Failure,
  ): Promise<Result<void, Failure>> {
    try {
      const { count } = await this.prisma.user.updateMany({
        where,
        data:
          tag === null
            ? CLEARED_CREATOR_CLAIM
            : {
                creatorStatus: tag.status,
                creatorPlatform: tag.platform,
                creatorHandle: tag.handle,
                creatorRequestedAt: tag.requestedAt,
                creatorReviewedAt: tag.reviewedAt,
              },
      });
      return count === 0 ? fail(noMatch) : ok(undefined);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        return fail(new ConflictFailure('errors.conflict.creator_handle_taken'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async isHandleApprovedForAnotherUser(handle: CreatorHandle, exceptUserId: string): Promise<Result<boolean, Failure>> {
    try {
      const holder = await this.prisma.user.findFirst({
        where: {
          id: { not: exceptUserId },
          creatorStatus: CreatorStatus.Approved,
          creatorPlatform: handle.platform,
          creatorHandle: handle.value,
        },
        select: { id: true },
      });
      return ok(holder !== null);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
