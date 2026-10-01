import type { UserProfileData } from '@application/users/ports/user-profile-repository-interface';
import type { UserProfileDto } from '@application/users/dtos/user-profile.dto';
import type { MyProfileDto } from '@application/users/dtos/my-profile.dto';
import { CreatorTagMapper } from '@application/users/mappers/creator-tag.mapper';

/** **Profile read model → `UserProfileDto` (anyone) or `MyProfileDto` (the owner).** */
export class UserProfileMapper {
  static toDto(data: UserProfileData): UserProfileDto {
    return { ...UserProfileMapper.base(data), creatorTags: CreatorTagMapper.toPublicDtos(data.creatorTags) };
  }

  static toMyDto(data: UserProfileData): MyProfileDto {
    return { ...UserProfileMapper.base(data), creatorTags: CreatorTagMapper.toOwnerDtos(data.creatorTags) };
  }

  private static base(data: UserProfileData): Omit<UserProfileDto, 'creatorTags'> {
    return {
      id: data.id,
      displayName: data.displayName,
      bio: data.bio,
      photoUrl: data.photoUrl,
      recipeCount: data.recipeCount,
      totalLikes: data.totalLikes,
      totalViews: data.totalViews,
      followerCount: data.followerCount,
      followingCount: data.followingCount,
      isFollowedByMe: data.isFollowedByMe,
      joinedAt: data.joinedAt.toISOString(),
    };
  }
}
