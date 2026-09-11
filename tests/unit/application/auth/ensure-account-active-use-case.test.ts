import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import type { AccountStatus, AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import { ok, fail } from '@core/result/result';
import { UnauthorizedFailure, UnknownFailure } from '@core/failure';

// Deletion tombstones the user and suspension flags it, and access tokens are
// stateless JWTs — so this check is the ONLY thing standing between such an
// account's still-valid token and full API access, on every single request.
// Regression cover for that, and for the two failure modes staying distinct.

const USER_ID = 'user-1';

function makeRepo(getAccountStatus: jest.Mock): AuthRepositoryInterface {
  return { getAccountStatus } as unknown as AuthRepositoryInterface;
}

function status(overrides: Partial<AccountStatus> = {}): AccountStatus {
  return { deletedAt: null, suspendedAt: null, ...overrides };
}

describe('EnsureAccountActiveUseCase', () => {
  it('allows the request through when the account is live', async () => {
    const useCase = new EnsureAccountActiveUseCase(makeRepo(jest.fn().mockResolvedValue(ok(status()))));

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(true);
  });

  it('returns UnauthorizedFailure with the deleted key when the account is tombstoned', async () => {
    const useCase = new EnsureAccountActiveUseCase(
      makeRepo(jest.fn().mockResolvedValue(ok(status({ deletedAt: new Date() })))),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnauthorizedFailure);
      expect(result.failure.messageKey).toBe('errors.unauthorized.account_deleted');
    }
  });

  it('returns UnauthorizedFailure with the deleted key when no account exists at all', async () => {
    const useCase = new EnsureAccountActiveUseCase(makeRepo(jest.fn().mockResolvedValue(ok(null))));

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.messageKey).toBe('errors.unauthorized.account_deleted');
    }
  });

  it('returns UnauthorizedFailure with a distinct key when the account is suspended', async () => {
    const useCase = new EnsureAccountActiveUseCase(
      makeRepo(jest.fn().mockResolvedValue(ok(status({ suspendedAt: new Date() })))),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnauthorizedFailure);
      expect(result.failure.messageKey).toBe('errors.unauthorized.account_suspended');
    }
  });

  it('treats deletion as taking priority when an account is somehow both deleted and suspended', async () => {
    const useCase = new EnsureAccountActiveUseCase(
      makeRepo(jest.fn().mockResolvedValue(ok(status({ deletedAt: new Date(), suspendedAt: new Date() })))),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.messageKey).toBe('errors.unauthorized.account_deleted');
    }
  });

  it('propagates a repository failure instead of failing open', async () => {
    const useCase = new EnsureAccountActiveUseCase(
      makeRepo(jest.fn().mockResolvedValue(fail(new UnknownFailure('db down')))),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnknownFailure);
    }
  });
});
