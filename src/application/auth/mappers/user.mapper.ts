import type { User } from '@domain/auth/user';
import type { UserDto } from '@application/auth/dtos/user.dto';
import { CreatorTagMapper } from '@application/users/mappers/creator-tag.mapper';

export class UserMapper {
  static toDto(user: User, role?: string): UserDto {
    return {
      id: user.id,
      email: user.email.value,
      displayName: user.displayName,
      bio: user.bio ?? null,
      photoUrl: user.photoUrl,
      role: role ?? 'user',
      createdAt: user.createdAt.toISOString(),
      creatorTags: CreatorTagMapper.toOwnerDtos(user.creatorTags),
    };
  }
}
