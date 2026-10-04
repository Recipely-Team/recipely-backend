import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type {
  CreatorListItemData,
  UserProfileRepositoryInterface,
  UserProfileData,
} from '@application/users/ports/user-profile-repository-interface';
import type { PageResult } from '@domain/common/page-result';
import { creatorHandleFromRow, creatorTagsFromRows, WITH_CREATOR_TAGS } from '@infrastructure/prisma/mappers/creator-tag.row-mapper';
import { creatorsListSql } from '@infrastructure/repositories/users/creators-list-sql';

/** A creators-list row as `$queryRaw` returns it, tags still unvalidated. */
interface CreatorListRow extends Omit<CreatorListItemData, 'creatorTags'> {
  readonly creatorTags: ReadonlyArray<{ readonly platform: string; readonly handle: string }>;
}

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
          ...WITH_CREATOR_TAGS,
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
        creatorTags: creatorTagsFromRows(user.creatorTags),
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listCreators(page: number, pageSize: number): Promise<Result<PageResult<CreatorListItemData>, Failure>> {
    try {
      const sql = creatorsListSql(page, pageSize);
      const [rows, totals] = await this.prisma.$transaction([
        this.prisma.$queryRaw<CreatorListRow[]>(sql.page),
        this.prisma.$queryRaw<Array<{ total: number }>>(sql.total),
      ]);
      // Each tag goes through the same validation as the profile's claims; one
      // that fails is logged and dropped, and so is a creator left with none.
      // `total` still counts such a creator (the SQL cannot see the handle
      // rules), so it may overcount — an accepted cost for a corruption that
      // should not exist.
      const items = rows.flatMap((row): CreatorListItemData[] => {
        const creatorTags = row.creatorTags.flatMap((tag) => creatorHandleFromRow(row.id, tag) ?? []);
        return creatorTags.length === 0 ? [] : [{ ...row, creatorTags }];
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
