import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';

export interface DeleteAccountInput {
  readonly userId: string;
}

/**
 * Deletes the authenticated user's account.
 *
 * The account is tombstoned, not dropped: its PII is scrubbed, its content is
 * soft-deleted, its sessions and relationships are purged, and the deletion is
 * written to the account event log — all in one transaction (see
 * `AuthRepositoryInterface.deleteAccount`). The account becomes unusable and
 * unrecoverable by its owner, which is what Apple App Store Guideline 5.1.1(v)
 * requires; keeping the scrubbed row is what makes the deletion auditable and
 * lets the user's recipes/comments be restored if a deletion is ever disputed.
 *
 * Signing up again with the same address yields a NEW account with a NEW id — the
 * tombstone is never revived, and the event log records the link between the two.
 */
export class DeleteAccountUseCase {
  constructor(private readonly authRepo: AuthRepositoryInterface) {}

  async execute(input: DeleteAccountInput): Promise<Result<void, Failure>> {
    return this.authRepo.deleteAccount(input.userId);
  }
}
