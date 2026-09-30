import { fail, ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { accountAccessRefusal } from '@domain/auth/account-access';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';

export interface EnsureAccountActiveInput {
  readonly userId: string;
}

/**
 * Rejects a request whose token belongs to a deleted or suspended account, or
 * to one that may never hold a session (the official account).
 *
 * Both deletion and suspension tombstone/flag the user instead of dropping the
 * row, and access tokens are stateless JWTs — so without this check a token
 * minted before either would keep working, with full access, until it expired.
 * The auth middleware runs this on every authenticated request, so suspending
 * an already-signed-in user takes effect on their very next request rather
 * than only at their next login.
 *
 * Deleted and suspended share the same status code and body shape (cheap,
 * app-compatible semantics — see the suspension feature's design notes); they
 * are distinguished only by message key, so an old app build that doesn't
 * recognize `account_suspended` still degrades to its generic unauthorized copy.
 */
export class EnsureAccountActiveUseCase {
  constructor(private readonly authRepo: AuthRepositoryInterface) {}

  async execute(input: EnsureAccountActiveInput): Promise<Result<void, Failure>> {
    const statusResult = await this.authRepo.getAccountStatus(input.userId);
    if (!statusResult.ok) return statusResult;

    const refusal = accountAccessRefusal(statusResult.value);
    return refusal === null ? ok(undefined) : fail(refusal);
  }
}
