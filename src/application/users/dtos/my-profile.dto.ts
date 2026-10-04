import type { UserProfileDto } from '@application/users/dtos/user-profile.dto';
import type { CreatorTagDto } from '@application/users/dtos/creator-tag.dto';

/**
 * `GET /me`: the public profile shape, except that `creatorTags` is the
 * owner's view — pending and rejected claims show too, with their status.
 */
export interface MyProfileDto extends Omit<UserProfileDto, 'creatorTags'> {
  readonly creatorTags: readonly CreatorTagDto[];
}
