import type { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorTagDto } from '@application/users/dtos/creator-tag.dto';
import type { PublicCreatorTagDto } from '@application/users/dtos/public-creator-tag.dto';

/**
 * **Creator claim → wire shapes.**
 *
 * @remarks
 * - `toOwnerDto` is what the owner sees: any status.
 * - `toPublicDto` is what everyone else sees: approved claims only, so a
 *   pending or rejected handle never reaches another user.
 */
export class CreatorTagMapper {
  static toOwnerDto(tag: CreatorTag | null): CreatorTagDto | null {
    if (tag === null) return null;
    return { platform: tag.platform, handle: tag.handle, status: tag.status };
  }

  static toPublicDto(tag: CreatorTag | null): PublicCreatorTagDto | null {
    if (tag === null || !tag.isApproved) return null;
    return { platform: tag.platform, handle: tag.handle };
  }
}
