import type { PrismaClient } from '@prisma/client';
import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { IUserFollowRepository } from '@domain/users/i-user-follow-repository';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export class PrismaUserFollowRepository implements IUserFollowRepository {
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
}
