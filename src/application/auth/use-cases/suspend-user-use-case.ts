import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';

export interface SuspendUserInput {
  readonly userId: string;
  readonly reason?: string;
  /** The admin performing it, for the account event log. */
  readonly actorId?: string;
}

/**
 * Backs the admin panel's suspend action on User. Suspension is reversible and
 * leaves the row, its content, and its PII untouched — unlike deletion, it is
 * not an App Store-mandated dead end, just a ban. `EnsureAccountActiveUseCase`
 * is what makes it take effect immediately for an already-signed-in user.
 */
export class SuspendUserUseCase {
  constructor(private readonly authRepo: AuthRepositoryInterface) {}

  async execute(input: SuspendUserInput): Promise<Result<void, Failure>> {
    return this.authRepo.suspendUser(input.userId, input.reason ?? null, input.actorId);
  }
}
