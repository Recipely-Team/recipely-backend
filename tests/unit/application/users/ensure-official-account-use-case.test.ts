import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Email } from '@domain/common/email';
import { UserRole } from '@domain/auth/user-role';
import { OfficialAccount } from '@domain/users/official-account';
import type { OfficialAccountRepositoryInterface, OfficialAccountSnapshot } from '@domain/users/official-account-repository-interface';
import { EnsureOfficialAccountUseCase } from '@application/users/use-cases/ensure-official-account-use-case';

class InMemoryAccounts implements OfficialAccountRepositoryInterface {
  readonly rows = new Map<string, OfficialAccountSnapshot & { displayName: string }>();
  deletedOfficialElsewhere = false;
  async findByEmail(email: Email): Promise<Result<OfficialAccountSnapshot | null, Failure>> {
    const row = this.rows.get(email.value);
    return ok(row === undefined ? null : { id: row.id, role: row.role, deleted: row.deleted, suspended: row.suspended });
  }
  async hasDeletedOfficial(): Promise<Result<boolean, Failure>> {
    return ok(this.deletedOfficialElsewhere);
  }
  async createOfficial(email: Email, displayName: string): Promise<Result<string, Failure>> {
    const id = `user-${this.rows.size + 1}`;
    this.rows.set(email.value, { id, role: UserRole.Official, displayName, deleted: false, suspended: false });
    return ok(id);
  }
}

describe('EnsureOfficialAccountUseCase', () => {
  it('creates the Recipely Mutfağı account once, then finds it', async () => {
    const accounts = new InMemoryAccounts();
    const useCase = new EnsureOfficialAccountUseCase(accounts);

    const first = await useCase.execute();
    const second = await useCase.execute();

    expect(first).toEqual({ ok: true, value: { userId: 'user-1', created: true } });
    expect(second).toEqual({ ok: true, value: { userId: 'user-1', created: false } });
    expect([...accounts.rows.entries()]).toEqual([
      [OfficialAccount.DefaultEmail, { id: 'user-1', role: 'official', displayName: 'Recipely Mutfağı', deleted: false, suspended: false }],
    ]);
  });

  it('uses the configured email', async () => {
    const accounts = new InMemoryAccounts();
    await new EnsureOfficialAccountUseCase(accounts).execute('Kitchen@Recipely.net');
    expect([...accounts.rows.keys()]).toEqual(['kitchen@recipely.net']);
  });

  it('refuses to promote an ordinary account that already holds the address', async () => {
    const accounts = new InMemoryAccounts();
    accounts.rows.set(OfficialAccount.DefaultEmail, { id: 'someone', role: UserRole.User, displayName: 'Someone', deleted: false, suspended: false });

    const result = await new EnsureOfficialAccountUseCase(accounts).execute();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.code).toBe('conflict');
    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.official_email_taken');
    expect(accounts.rows.get(OfficialAccount.DefaultEmail)?.role).toBe(UserRole.User);
  });

  it.each([
    ['suspended', { suspended: true, deleted: false }, 'errors.conflict.official_account_suspended'],
    ['deleted', { suspended: false, deleted: true }, 'errors.conflict.official_account_deleted'],
  ])('says so, and creates nothing, when the official account is %s', async (_state, flags, key) => {
    const accounts = new InMemoryAccounts();
    accounts.rows.set(OfficialAccount.DefaultEmail, { id: 'official-1', role: UserRole.Official, displayName: 'Recipely Mutfağı', ...flags });

    const result = await new EnsureOfficialAccountUseCase(accounts).execute();

    expect(!result.ok && result.failure.messageKey).toBe(key);
    expect(accounts.rows.size).toBe(1);
  });

  it('does not mint a twin when a deleted official account holds a rewritten email', async () => {
    const accounts = new InMemoryAccounts();
    accounts.deletedOfficialElsewhere = true;

    const result = await new EnsureOfficialAccountUseCase(accounts).execute();

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.official_account_deleted');
    expect(accounts.rows.size).toBe(0);
  });
});
