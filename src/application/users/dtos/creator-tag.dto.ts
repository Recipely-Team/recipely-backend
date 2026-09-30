import type { CreatorPlatform } from '@domain/users/creator-platform';
import type { ClaimedCreatorStatus } from '@domain/users/creator-status';

/** The owner's view of their claim, status included (`GET /me`, `PUT /me/creator`). */
export interface CreatorTagDto {
  readonly platform: CreatorPlatform;
  readonly handle: string;
  readonly status: ClaimedCreatorStatus;
}
