import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { InstagramConnection } from '@domain/instagram/instagram-connection';

/** Linked Instagram accounts, one per user and one per Instagram account. */
export interface InstagramConnectionRepositoryInterface {
  findByUserId(userId: string): Promise<Result<InstagramConnection | null, Failure>>;
  /** By the professional account id webhooks use, or the app-scoped id Meta's deletion callbacks may use. */
  findByIgUserId(igUserId: string): Promise<Result<InstagramConnection | null, Failure>>;
  /**
   * Creates or replaces the user's connection. ConflictFailure
   * `instagram_account_linked` when the Instagram account is linked to another
   * user (the store's own uniqueness, should two links race).
   */
  save(connection: InstagramConnection): Promise<Result<void, Failure>>;
  /** Removes the user's connection only; rules and history stay. */
  delete(userId: string): Promise<Result<void, Failure>>;
  /** Active connections whose token ends before `before`, soonest first. */
  listExpiringBefore(before: Date, limit: number): Promise<Result<InstagramConnection[], Failure>>;
  /** Marks every active connection whose token has ended as expired; answers how many. */
  expireLapsed(now: Date): Promise<Result<number, Failure>>;
  /**
   * Hard-deletes everything Instagram of the user's — connection, pending
   * links, rules, sends and the account's queued webhook events — for
   * account deletion and Meta's data-deletion callback.
   */
  purgeUser(userId: string): Promise<Result<void, Failure>>;
}
