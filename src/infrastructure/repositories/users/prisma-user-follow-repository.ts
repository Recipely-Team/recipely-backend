import type { PrismaClient } from '@prisma/client';
import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { UserFollowRepositoryInterface } from '@domain/users/user-follow-repository-interface';
import type { FollowerLocale } from '@domain/users/follower-locale';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export class PrismaUserFollowRepository implements UserFollowRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async follow(followerId: string, followingId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.userFollow.create({ data: { followerId, followingId } });
      return ok(undefined);
    } catch {
      return fail(new UnknownFailure('Failed to follow user'));
    }
  }

  async unfollow(followerId: string, followingId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.userFollow.delete({
        where: { followerId_followingId: { followerId, followingId } },
      });
      return ok(undefined);
    } catch {
      return fail(new UnknownFailure('Failed to unfollow user'));
    }
  }

  async isFollowing(followerId: string, followingId: string): Promise<Result<boolean, Failure>> {
    try {
      const row = await this.prisma.userFollow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
      });
      return ok(row !== null);
    } catch {
      return fail(new UnknownFailure('Failed to check follow'));
    }
  }

  async followerCount(userId: string): Promise<Result<number, Failure>> {
    try {
      const count = await this.prisma.userFollow.count({ where: { followingId: userId } });
      return ok(count);
    } catch {
      return fail(new UnknownFailure('Failed to count followers'));
    }
  }

  async followingCount(userId: string): Promise<Result<number, Failure>> {
    try {
      const count = await this.prisma.userFollow.count({ where: { followerId: userId } });
      return ok(count);
    } catch {
      return fail(new UnknownFailure('Failed to count following'));
    }
  }

  async listFollowersWithLocale(userId: string, limit: number): Promise<Result<readonly FollowerLocale[], Failure>> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ user_id: string; locale: string | null }>>`
        SELECT f.follower_id::text AS user_id,
               (SELECT d.locale FROM devices d
                 WHERE d.user_id = f.follower_id AND d.locale IS NOT NULL
                 ORDER BY d.last_login_at DESC LIMIT 1) AS locale
        FROM user_follows f
        JOIN users u ON u.id = f.follower_id AND u.deleted_at IS NULL
        WHERE f.following_id = ${userId}::uuid
        ORDER BY f.created_at
        LIMIT ${limit}
      `;
      return ok(rows.map((row) => ({ userId: row.user_id, locale: row.locale })));
    } catch {
      return fail(new UnknownFailure('Failed to list followers'));
    }
  }
}
