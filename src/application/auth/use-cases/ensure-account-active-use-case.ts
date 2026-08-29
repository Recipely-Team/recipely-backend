import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';

export interface EnsureAccountActiveInput {
  readonly userId: string;
}

/**
 * Rejects a request whose token belongs to a deleted or suspended account.
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
  constructor(private readonly authRepo: IAuthRepository) {}

  async execute(input: EnsureAccountActiveInput): Promise<Result<void, Failure>> {
    const statusResult = await this.authRepo.getAccountStatus(input.userId);
    if (!statusResult.ok) return statusResult;

    const status = statusResult.value;
    if (!status || status.deletedAt) {
      return fail(new UnauthorizedFailure('errors.unauthorized.account_deleted'));
    }
    if (status.suspendedAt) {
      return fail(new UnauthorizedFailure('errors.unauthorized.account_suspended'));
    }
    return ok(undefined);
  }
}
