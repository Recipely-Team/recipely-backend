import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Email } from '@domain/common/email';

/** The live account an email already names. */
export interface OfficialAccountSnapshot {
  readonly id: string;
  readonly role: string;
}

/** Finds and creates the official publishing account. */
export interface OfficialAccountRepositoryInterface {
  /** The live (not deleted) account with this email, or `null`. */
  findByEmail(email: Email): Promise<Result<OfficialAccountSnapshot | null, Failure>>;
  /** Creates it with `role = 'official'` and no password; returns its id. */
  createOfficial(email: Email, displayName: string): Promise<Result<string, Failure>>;
}
