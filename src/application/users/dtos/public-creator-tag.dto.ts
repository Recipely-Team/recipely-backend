import type { CreatorPlatform } from '@domain/users/creator-platform';

/** What anyone else sees of an approved claim — the badge and the handle. */
export interface PublicCreatorTagDto {
  readonly platform: CreatorPlatform;
  readonly handle: string;
}
