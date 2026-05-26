export interface UserProfileDto {
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
  readonly joinedAt: string; // ISO date string
}
