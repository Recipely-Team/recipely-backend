import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Email } from '@domain/common/email';
import { UserRole } from '@domain/auth/user-role';
import { OfficialAccount } from '@domain/users/official-account';
import type { OfficialAccountRepositoryInterface, OfficialAccountSnapshot } from '@application/users/ports/official-account-repository-interface';
import { EnsureOfficialAccountUseCase } from '@application/users/use-cases/ensure-official-account-use-case';

class InMemoryAccounts implements OfficialAccountRepositoryInterface {
  readonly rows = new Map<string, OfficialAccountSnapshot & { displayName: string }>();
  async findByEmail(email: Email): Promise<Result<OfficialAccountSnapshot | null, Failure>> {
    const row = this.rows.get(email.value);
    return ok(row === undefined ? null : { id: row.id, role: row.role });
  }
  async createOfficial(email: Email, displayName: string): Promise<Result<string, Failure>> {
    const id = `user-${this.rows.size + 1}`;
    this.rows.set(email.value, { id, role: UserRole.Official, displayName });
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
      [OfficialAccount.DefaultEmail, { id: 'user-1', role: 'official', displayName: 'Recipely Mutfağı' }],
    ]);
  });

  it('uses the configured email', async () => {
    const accounts = new InMemoryAccounts();
    await new EnsureOfficialAccountUseCase(accounts).execute('Kitchen@Recipely.net');
    expect([...accounts.rows.keys()]).toEqual(['kitchen@recipely.net']);
  });

  it('refuses to promote an ordinary account that already holds the address', async () => {
    const accounts = new InMemoryAccounts();
    accounts.rows.set(OfficialAccount.DefaultEmail, { id: 'someone', role: UserRole.User, displayName: 'Someone' });

    const result = await new EnsureOfficialAccountUseCase(accounts).execute();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.code).toBe('conflict');
    expect(accounts.rows.get(OfficialAccount.DefaultEmail)?.role).toBe(UserRole.User);
  });
});
