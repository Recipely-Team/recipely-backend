import type { User } from '@domain/auth/user';
import type { UserDto } from '@application/auth/dtos/auth.dto';

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
    };
  }
}
