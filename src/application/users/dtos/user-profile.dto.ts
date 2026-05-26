export interface UserProfileDto {
  readonly id: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
  readonly recipeCount: number;
  readonly totalLikes: number;
  readonly totalViews: number;
  readonly joinedAt: string; // ISO date string
}
