import type { CreatorTagDto } from '@application/users/dtos/creator-tag.dto';

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly photoUrl: string | null;
  readonly role: string;
  readonly createdAt: string; // ISO
  /** The owner's claim with its status; `null` when there is none. */
  readonly creator: CreatorTagDto | null;
}
