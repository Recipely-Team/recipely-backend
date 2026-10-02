import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/** An Instagram authorization parked until the app finalises it (see `instagram_pending_links`). */
export interface PendingInstagramLink {
  readonly userId: string;
  readonly igUserId: string;
  readonly appScopedId: string | null;
  readonly username: string;
  /** Plain here; the repository encrypts it at rest. */
  readonly accessToken: string;
  readonly tokenExpiresAt: Date;
  /** When the one-time code stops working. */
  readonly expiresAt: Date;
}

/** Pending links, found only by the hash of their one-time code. */
export interface InstagramPendingLinkRepositoryInterface {
  create(codeHash: string, link: PendingInstagramLink): Promise<Result<void, Failure>>;
  /**
   * Removes and answers the link for this code hash — once: a second take of
   * the same code finds nothing. `null` when there is none.
   */
  take(codeHash: string): Promise<Result<PendingInstagramLink | null, Failure>>;
}
