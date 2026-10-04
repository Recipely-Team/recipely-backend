import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Email } from '@domain/common/email';

/** The account an email already names — live, suspended or deleted. */
export interface OfficialAccountSnapshot {
  readonly id: string;
  readonly role: string;
  readonly deleted: boolean;
  readonly suspended: boolean;
}

/**
 * Finds and creates the official publishing account.
 *
 * @remarks
 * Unlike every other read of `users`, these do NOT hide deleted rows: the
 * question is whether an official account ever existed, and a deleted one is
 * a decision somebody made that the import must report, not paper over.
 */
export interface OfficialAccountRepositoryInterface {
  /** The account with this email, deleted or not, or `null`. */
  findByEmail(email: Email): Promise<Result<OfficialAccountSnapshot | null, Failure>>;
  /**
   * Whether a deleted account with the official role exists. Deletion rewrites
   * the email, so `findByEmail` cannot see it by the address it had.
   */
  hasDeletedOfficial(): Promise<Result<boolean, Failure>>;
  /** Creates it with `role = 'official'` and no password; returns its id. */
  createOfficial(email: Email, displayName: string): Promise<Result<string, Failure>>;
}
