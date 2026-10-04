import type { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorTagDto } from '@application/users/dtos/creator-tag.dto';
import type { PublicCreatorTagDto } from '@application/users/dtos/public-creator-tag.dto';

/**
 * **Creator claims → wire shapes.**
 *
 * @remarks
 * - `toOwnerDtos` is what the owner sees: every claim, any status.
 * - `toPublicDtos` is what everyone else sees: approved claims only, so a
 *   pending or rejected handle never reaches another user. A user is a
 *   creator when this list is non-empty.
 * - Both lists are ordered by platform, so the badges never swap places
 *   between two reads.
 */
export class CreatorTagMapper {
  static toOwnerDto(tag: CreatorTag): CreatorTagDto {
    return { platform: tag.platform, handle: tag.handle, status: tag.status };
  }

  static toOwnerDtos(tags: readonly CreatorTag[]): CreatorTagDto[] {
    return byPlatform(tags).map(CreatorTagMapper.toOwnerDto);
  }

  static toPublicDtos(tags: readonly CreatorTag[]): PublicCreatorTagDto[] {
    return byPlatform(tags.filter((tag) => tag.isApproved)).map((tag) => ({ platform: tag.platform, handle: tag.handle }));
  }
}

function byPlatform(tags: readonly CreatorTag[]): CreatorTag[] {
  return [...tags].sort((a, b) => a.platform.localeCompare(b.platform));
}
