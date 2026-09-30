import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import { CreatorStatus } from '@domain/users/creator-status';
import { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorHandle } from '@domain/users/creator-handle';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';

const UNIQUE_VIOLATION = 'P2002';

/**
 * **Creator claim columns on `users`.**
 *
 * @remarks
 * - Every read and write is scoped to `deletedAt: null`; a tombstoned account
 *   is "no such user" here as everywhere else.
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
          creatorStatus: true,
          creatorPlatform: true,
          creatorHandle: true,
          creatorRequestedAt: true,
          creatorReviewedAt: true,
        },
      });
      if (row === null) return fail(new NotFoundFailure('errors.not_found.user'));
      const tag = CreatorTag.restore({
        status: row.creatorStatus,
        platform: row.creatorPlatform,
        handle: row.creatorHandle,
        requestedAt: row.creatorRequestedAt,
        reviewedAt: row.creatorReviewedAt,
      });
      return tag.ok ? tag : fail(new UnknownFailure(`Corrupt user row ${userId}: invalid creator claim`));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async save(userId: string, tag: CreatorTag | null): Promise<Result<void, Failure>> {
    try {
      const { count } = await this.prisma.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: {
          creatorStatus: tag?.status ?? CreatorStatus.None,
          creatorPlatform: tag?.platform ?? null,
          creatorHandle: tag?.handle ?? null,
          creatorRequestedAt: tag?.requestedAt ?? null,
          creatorReviewedAt: tag?.reviewedAt ?? null,
        },
      });
      return count === 0 ? fail(new NotFoundFailure('errors.not_found.user')) : ok(undefined);
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
