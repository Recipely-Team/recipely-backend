import { UnsuspendUserUseCase } from '@application/auth/use-cases/unsuspend-user-use-case';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import { ok, fail } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';

const USER_ID = 'user-1';

function makeRepo(unsuspendUser: jest.Mock): IAuthRepository {
  return { unsuspendUser } as unknown as IAuthRepository;
}

describe('UnsuspendUserUseCase', () => {
  it('lifts the suspension via the repository', async () => {
    const unsuspendUser = jest.fn().mockResolvedValue(ok(undefined));
    const useCase = new UnsuspendUserUseCase(makeRepo(unsuspendUser));

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(true);
    expect(unsuspendUser).toHaveBeenCalledWith(USER_ID);
  });

  it('propagates a repository failure', async () => {
    const unsuspendUser = jest.fn().mockResolvedValue(fail(new NotFoundFailure('errors.not_found.user')));
    const useCase = new UnsuspendUserUseCase(makeRepo(unsuspendUser));

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBeInstanceOf(NotFoundFailure);
  });
});
