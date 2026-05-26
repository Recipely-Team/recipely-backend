import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface IUserFollowRepository {
  follow(followerId: string, followingId: string): Promise<Result<void, Failure>>;
  unfollow(followerId: string, followingId: string): Promise<Result<void, Failure>>;
  isFollowing(followerId: string, followingId: string): Promise<Result<boolean, Failure>>;
  followerCount(userId: string): Promise<Result<number, Failure>>;
  followingCount(userId: string): Promise<Result<number, Failure>>;
}
