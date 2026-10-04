import type { PublicCreatorTagDto } from '@application/users/dtos/public-creator-tag.dto';

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
  /** Approved claims only, one per platform, ordered by platform; empty for a non-creator. */
  readonly creatorTags: readonly PublicCreatorTagDto[];
}
