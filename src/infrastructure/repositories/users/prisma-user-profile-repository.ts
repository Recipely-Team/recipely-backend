import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type {
  CreatorListItemData,
  UserProfileRepositoryInterface,
  UserProfileData,
} from '@application/users/ports/user-profile-repository-interface';
import type { PageResult } from '@domain/common/page-result';
import { creatorHandleFromRow, creatorTagFromRow } from '@infrastructure/prisma/mappers/creator-tag.row-mapper';
import { creatorsListSql } from '@infrastructure/repositories/users/creators-list-sql';

export class PrismaUserProfileRepository implements UserProfileRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async getProfile(userId: string, currentUserId?: string): Promise<Result<UserProfileData, Failure>> {
    try {
      // `deletedAt: null` — a tombstoned account has no public profile: the
      // endpoint must 404 exactly as it did when deletion dropped the row.
      // A suspended account is hidden from everyone but its owner, as it is
      // from GET /users/creators; the owner still reaches it through /me.
      const user = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null, ...(currentUserId !== userId ? { suspendedAt: null } : {}) },
        select: {
          id: true,
          displayName: true,
          bio: true,
          photoUrl: true,
          createdAt: true,
          creatorStatus: true,
          creatorPlatform: true,
          creatorHandle: true,
          creatorRequestedAt: true,
          creatorReviewedAt: true,
        },
      });

      if (!user) {
        return fail(new NotFoundFailure('errors.not_found.user'));
      }

      const [recipeCount, totalLikes, viewAgg, followerCount, followingCount] =
        await this.prisma.$transaction([
          this.prisma.recipe.count({
            where: { ownerId: userId, deletedAt: null, isPublished: true },
          }),
          this.prisma.recipeLike.count({
            where: { recipe: { ownerId: userId } },
          }),
          this.prisma.recipe.aggregate({
            _sum: { viewCount: true },
            where: { ownerId: userId, deletedAt: null },
          }),
          this.prisma.userFollow.count({ where: { followingId: userId } }),
          this.prisma.userFollow.count({ where: { followerId: userId } }),
        ]);

      let isFollowedByMe = false;
      if (currentUserId !== undefined && currentUserId !== userId) {
        const follow = await this.prisma.userFollow.findUnique({
          where: { followerId_followingId: { followerId: currentUserId, followingId: userId } },
        });
        isFollowedByMe = follow !== null;
      }

      return ok({
        id: user.id,
        displayName: user.displayName,
        bio: user.bio,
        photoUrl: user.photoUrl,
        recipeCount,
        totalLikes,
        totalViews: viewAgg._sum.viewCount ?? 0,
        followerCount,
        followingCount,
        isFollowedByMe,
        joinedAt: user.createdAt,
        creatorTag: creatorTagFromRow(user),
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listCreators(page: number, pageSize: number): Promise<Result<PageResult<CreatorListItemData>, Failure>> {
    try {
      const sql = creatorsListSql(page, pageSize);
      const [rows, totals] = await this.prisma.$transaction([
        this.prisma.$queryRaw<Array<Omit<CreatorListItemData, 'platform'> & { platform: string }>>(sql.page),
        this.prisma.$queryRaw<Array<{ total: number }>>(sql.total),
      ]);
      // Each row goes through the same validation as the profile's claim; one
      // that fails is logged and dropped. `total` still counts it (the SQL
      // cannot see the handle rules), so it may overcount by the dropped rows
      // — an accepted cost for a corruption that should not exist.
      const items = rows.flatMap((row): CreatorListItemData[] => {
        const handle = creatorHandleFromRow(row);
        return handle === null ? [] : [{ ...row, platform: handle.platform, handle: handle.value }];
      });
      return ok({ items, total: totals[0]?.total ?? 0, page, pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
