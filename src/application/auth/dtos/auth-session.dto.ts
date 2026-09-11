import type { UserDto } from '@application/auth/dtos/user.dto';

export interface AuthSessionDto {
  readonly token: string;
  readonly user: UserDto;
}
