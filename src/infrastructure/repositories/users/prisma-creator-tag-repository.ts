import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import { CreatorStatus } from '@domain/users/creator-status';
import { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorHandle } from '@domain/users/creator-handle';
import type { CreatorPlatform } from '@domain/users/creator-platform';
import type { CreatorTagRepositoryInterface, OwnedCreatorTag } from '@domain/users/creator-tag-repository-interface';
import { creatorTagsFromRows, WITH_CREATOR_TAGS } from '@infrastructure/prisma/mappers/creator-tag.row-mapper';

const UNIQUE_VIOLATION = 'P2002';
const LIVE_USER = { deletedAt: null } as const;

/**
 * **`creator_tags` — one row per (user, platform).**
 *
 * @remarks
 * - Every read and write is scoped to a live owner (`deletedAt: null`); a
 *   tombstoned account is "no such user" here as everywhere else, and its rows
 *   are deleted with it anyway.
 * - `save` upserts on the (user, platform) key, so a re-claim after a
 *   rejection, or a new handle, replaces that platform's row in place.
 * - A review is written only over the pending claim it was read from.
 * - A unique violation on a write is reported as `creator_handle_taken`: the
 *   partial index `creator_tags_approved_handle_key` refusing a second approved
 *   holder (two approvals racing). The only other unique key, (user,
 *   platform), can collide only on one user's two simultaneous first claims of
 *   a platform; `save` retries that upsert once, which then updates the row.
 */
export class PrismaCreatorTagRepository implements CreatorTagRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<Result<readonly CreatorTag[], Failure>> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, ...LIVE_USER },
        select: { id: true, ...WITH_CREATOR_TAGS },
      });
      if (user === null) return fail(new NotFoundFailure('errors.not_found.user'));
      return ok(creatorTagsFromRows(user.creatorTags));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findById(tagId: string): Promise<Result<OwnedCreatorTag | null, Failure>> {
    try {
      const row = await this.prisma.creatorTag.findFirst({ where: { id: tagId, user: LIVE_USER } });
      if (row === null) return ok(null);
      const restored = CreatorTag.restore(row);
      return restored.ok ? ok({ userId: row.userId, tag: restored.value }) : restored;
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async save(userId: string, tag: CreatorTag): Promise<Result<void, Failure>> {
    const columns = {
      handle: tag.handle,
      status: tag.status,
      requestedAt: tag.requestedAt,
      reviewedAt: tag.reviewedAt,
    };
    return this.guard(async () => {
      if (!(await this.isLive(userId))) return fail(new NotFoundFailure('errors.not_found.user'));
      const upsert = () =>
        this.prisma.creatorTag.upsert({
          where: { userId_platform: { userId, platform: tag.platform } },
          create: { userId, platform: tag.platform, ...columns },
          update: columns,
        });
      try {
        await upsert();
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // A double-tap's twin inserted the row first; now it exists, so the retry updates it.
        await upsert();
      }
      return ok(undefined);
    });
  }

  async remove(userId: string, platform: CreatorPlatform): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      if (!(await this.isLive(userId))) return fail(new NotFoundFailure('errors.not_found.user'));
      await this.prisma.creatorTag.deleteMany({ where: { userId, platform } });
      return ok(undefined);
    });
  }

  async saveReview(userId: string, reviewed: CreatorTag): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      // Conditional on the claim still being the pending one the review read: a
      // user who changed or withdrew it meanwhile must not have the new claim
      // approved (or their removal undone) by a decision about the old one.
      const { count } = await this.prisma.creatorTag.updateMany({
        where: {
          userId,
          platform: reviewed.platform,
          user: LIVE_USER,
          status: CreatorStatus.Pending,
          handle: reviewed.handle,
          // A withdraw + re-request of the same handle is a new claim, stamped anew.
          requestedAt: reviewed.requestedAt,
        },
        data: { status: reviewed.status, reviewedAt: reviewed.reviewedAt },
      });
      return count === 0 ? fail(new ConflictFailure('errors.conflict.creator_not_pending')) : ok(undefined);
    });
  }

  async findApprovedOwner(handle: CreatorHandle): Promise<Result<string | null, Failure>> {
    try {
      const holder = await this.prisma.creatorTag.findFirst({
        where: { status: CreatorStatus.Approved, platform: handle.platform, handle: handle.value, user: { deletedAt: null } },
        select: { userId: true },
      });
      return ok(holder?.userId ?? null);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async isHandleApprovedForAnotherUser(handle: CreatorHandle, exceptUserId: string): Promise<Result<boolean, Failure>> {
    try {
      const holder = await this.prisma.creatorTag.findFirst({
        where: {
          userId: { not: exceptUserId },
          status: CreatorStatus.Approved,
          platform: handle.platform,
          handle: handle.value,
        },
        select: { id: true },
      });
      return ok(holder !== null);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  private async isLive(userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId, ...LIVE_USER } })) > 0;
  }

  private async guard(write: () => Promise<Result<void, Failure>>): Promise<Result<void, Failure>> {
    try {
      return await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        return fail(new ConflictFailure('errors.conflict.creator_handle_taken'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
