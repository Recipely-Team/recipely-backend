import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface UserProfileData {
  readonly id: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly photoUrl: string | null;
  readonly recipeCount: number;
  readonly totalLikes: number;
  readonly totalViews: number;
  readonly followerCount: number;
  readonly followingCount: number;
  readonly isFollowedByMe: boolean;
  readonly joinedAt: Date;
}

export interface IUserProfileRepository {
  getProfile(userId: string, currentUserId?: string): Promise<Result<UserProfileData, Failure>>;
}
