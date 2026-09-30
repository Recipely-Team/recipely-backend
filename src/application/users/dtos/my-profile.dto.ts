import type { UserProfileDto } from '@application/users/dtos/user-profile.dto';
import type { CreatorTagDto } from '@application/users/dtos/creator-tag.dto';

/**
 * `GET /me`: the public profile shape, except that `creator` is the owner's
 * view — a pending or rejected claim shows too, with its status.
 */
export interface MyProfileDto extends Omit<UserProfileDto, 'creator'> {
  readonly creator: CreatorTagDto | null;
}
