import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface UserProfileData {
  readonly id: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
  readonly recipeCount: number;
  readonly totalLikes: number;
  readonly totalViews: number;
  readonly joinedAt: Date;
}

export interface IUserProfileRepository {
  getProfile(userId: string): Promise<Result<UserProfileData, Failure>>;
}
