import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import { UserRole } from '@domain/auth/user-role';
import { OfficialAccount } from '@domain/users/official-account';
import type { OfficialAccountRepositoryInterface } from '@domain/users/official-account-repository-interface';

export interface EnsureOfficialAccountResult {
  readonly userId: string;
  readonly created: boolean;
}

/**
 * Makes sure the "Recipely Mutfağı" account exists, and says which row it is.
 *
 * @remarks
 * - **Idempotent**: found by email, created only when absent, so every run of
 *   the curated import can call it first.
 * - **A suspended or deleted official account is reported, not replaced.**
 *   Somebody took it down; publishing under a fresh twin would undo that.
 * - **Never promotes an existing account.** An ordinary user already holding
 *   the address has a password and could sign in as the official account, so
 *   that is a conflict for a person to resolve, not something to paper over.
 */
export class EnsureOfficialAccountUseCase {
  constructor(private readonly accounts: OfficialAccountRepositoryInterface) {}

  async execute(rawEmail: string = OfficialAccount.DefaultEmail): Promise<Result<EnsureOfficialAccountResult, Failure>> {
    const email = Email.create(rawEmail);
    if (!email.ok) return email;

    const existing = await this.accounts.findByEmail(email.value);
    if (!existing.ok) return existing;
    const account = existing.value;
    if (account !== null) {
      if (account.role !== UserRole.Official) return fail(new ConflictFailure('errors.conflict.official_email_taken'));
      if (account.deleted) return fail(new ConflictFailure('errors.conflict.official_account_deleted'));
      if (account.suspended) return fail(new ConflictFailure('errors.conflict.official_account_suspended'));
      return ok({ userId: account.id, created: false });
    }

    const deleted = await this.accounts.hasDeletedOfficial();
    if (!deleted.ok) return deleted;
    if (deleted.value) return fail(new ConflictFailure('errors.conflict.official_account_deleted'));

    const created = await this.accounts.createOfficial(email.value, OfficialAccount.DisplayName);
    if (!created.ok) return created;
    return ok({ userId: created.value, created: true });
  }
}
