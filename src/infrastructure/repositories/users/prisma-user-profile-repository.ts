import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { IUserProfileRepository, UserProfileData } from '@application/users/ports/i-user-profile-repository';

export class PrismaUserProfileRepository implements IUserProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getProfile(userId: string, currentUserId?: string): Promise<Result<UserProfileData, Failure>> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, displayName: true, bio: true, photoUrl: true, createdAt: true },
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
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
