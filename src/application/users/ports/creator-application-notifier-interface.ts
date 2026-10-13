import type { CreatorPlatform } from '@domain/users/creator-platform';

/** A creator tag request worth a person's look: who asked, on which platform, under which handle. */
export interface CreatorApplication {
  readonly userId: string;
  readonly platform: CreatorPlatform;
  readonly handle: string;
}

/**
 * Tells the team a creator has applied, so a request does not sit in the
 * admin queue until someone happens to open it. Never fails the request:
 * an implementation swallows and logs its own errors.
 */
export interface CreatorApplicationNotifierInterface {
  applied(application: CreatorApplication): Promise<void>;
}
