import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FollowerLocale } from '@domain/users/follower-locale';

export interface UserFollowRepositoryInterface {
  follow(followerId: string, followingId: string): Promise<Result<void, Failure>>;
  unfollow(followerId: string, followingId: string): Promise<Result<void, Failure>>;
  isFollowing(followerId: string, followingId: string): Promise<Result<boolean, Failure>>;
  followerCount(userId: string): Promise<Result<number, Failure>>;
  followingCount(userId: string): Promise<Result<number, Failure>>;
  /**
   * Live followers of `userId`, each with the app language their most recent
   * device used (`null` when none is known), at most `limit` of them.
   */
  listFollowersWithLocale(userId: string, limit: number): Promise<Result<readonly FollowerLocale[], Failure>>;
}
