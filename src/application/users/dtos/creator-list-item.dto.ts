import type { PublicCreatorTagDto } from '@application/users/dtos/public-creator-tag.dto';

/** One row of `GET /users/creators`. */
export interface CreatorListItemDto {
  readonly id: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
  readonly creator: PublicCreatorTagDto;
  /** Published and approved recipes only. */
  readonly recipeCount: number;
  readonly followerCount: number;
}
