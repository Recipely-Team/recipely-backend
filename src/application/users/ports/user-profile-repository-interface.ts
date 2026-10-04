import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';
import type { PageResult } from '@domain/common/page-result';
import type { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorHandle } from '@domain/users/creator-handle';

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
  /** The claims in any status; the use case decides who may see which. */
  readonly creatorTags: readonly CreatorTag[];
}

/** One approved creator, as the public creators list reads it. */
export interface CreatorListItemData {
  readonly id: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
  /** The approved claims, never empty. */
  readonly creatorTags: readonly CreatorHandle[];
  readonly recipeCount: number;
  readonly followerCount: number;
}

export interface UserProfileRepositoryInterface {
  getProfile(userId: string, currentUserId?: string): Promise<Result<UserProfileData, Failure>>;
  /**
   * Users with at least one approved creator tag and at least one published, approved recipe, who are
   * neither deleted nor suspended — ordered by follower count, then that recipe
   * count (both descending), then id. `pageSize` arrives already capped.
   */
  listCreators(page: number, pageSize: number): Promise<Result<PageResult<CreatorListItemData>, Failure>>;
}
