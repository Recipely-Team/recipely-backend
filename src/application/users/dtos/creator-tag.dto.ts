import type { CreatorPlatform } from '@domain/users/creator-platform';
import type { CreatorStatus } from '@domain/users/creator-status';

/** The owner's view of one claim, status included (`GET /me`, `PUT /me/creator`). */
export interface CreatorTagDto {
  readonly platform: CreatorPlatform;
  readonly handle: string;
  readonly status: CreatorStatus;
}
