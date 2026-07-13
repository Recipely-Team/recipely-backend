import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';

export interface EnsureAccountActiveInput {
  readonly userId: string;
}

/**
 * Rejects a request whose token belongs to a deleted account.
 *
 * Deletion tombstones the user instead of dropping the row, and access tokens are
 * stateless JWTs — so without this check a token minted before the deletion would
 * keep working, with full access, until it expired. The auth middleware runs this
 * on every authenticated request.
 */
export class EnsureAccountActiveUseCase {
  constructor(private readonly authRepo: IAuthRepository) {}

  async execute(input: EnsureAccountActiveInput): Promise<Result<void, Failure>> {
    const activeResult = await this.authRepo.isActive(input.userId);
    if (!activeResult.ok) return activeResult;

    if (!activeResult.value) {
      return fail(new UnauthorizedFailure('errors.unauthorized.account_deleted'));
    }
    return ok(undefined);
  }
}
