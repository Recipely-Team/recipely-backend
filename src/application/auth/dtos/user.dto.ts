import type { CreatorTagDto } from '@application/users/dtos/creator-tag.dto';

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly photoUrl: string | null;
  readonly role: string;
  readonly createdAt: string; // ISO
  /** The owner's claims with their status, one per platform; empty when none. */
  readonly creatorTags: readonly CreatorTagDto[];
}
