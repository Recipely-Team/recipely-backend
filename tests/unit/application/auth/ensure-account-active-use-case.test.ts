import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import { ok, fail } from '@core/result/result';
import { UnauthorizedFailure, UnknownFailure } from '@core/failure';

// Deletion tombstones the user instead of dropping the row, and access tokens are
// stateless JWTs — so this check is the ONLY thing standing between a deleted
// account's still-valid token and full API access. Regression cover for that.

const USER_ID = 'user-1';

function makeRepo(isActive: jest.Mock): IAuthRepository {
  return { isActive } as unknown as IAuthRepository;
}

describe('EnsureAccountActiveUseCase', () => {
  it('allows the request through when the account is live', async () => {
    const useCase = new EnsureAccountActiveUseCase(makeRepo(jest.fn().mockResolvedValue(ok(true))));

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(true);
  });

  it('returns UnauthorizedFailure when the token belongs to a deleted account', async () => {
    const useCase = new EnsureAccountActiveUseCase(makeRepo(jest.fn().mockResolvedValue(ok(false))));

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnauthorizedFailure);
      expect(result.failure.messageKey).toBe('errors.unauthorized.account_deleted');
    }
  });

  it('propagates a repository failure instead of failing open', async () => {
    const useCase = new EnsureAccountActiveUseCase(
      makeRepo(jest.fn().mockResolvedValue(fail(new UnknownFailure('errors.internal.unexpected', 'db down')))),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnknownFailure);
    }
  });
});
