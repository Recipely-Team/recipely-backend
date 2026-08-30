import { SuspendUserUseCase } from '@application/auth/use-cases/suspend-user-use-case';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import { ok, fail } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';

const USER_ID = 'user-1';

function makeRepo(suspendUser: jest.Mock): IAuthRepository {
  return { suspendUser } as unknown as IAuthRepository;
}

describe('SuspendUserUseCase', () => {
  it('passes the reason through to the repository', async () => {
    const suspendUser = jest.fn().mockResolvedValue(ok(undefined));
    const useCase = new SuspendUserUseCase(makeRepo(suspendUser));

    const result = await useCase.execute({ userId: USER_ID, reason: 'spamming comments' });

    expect(result.ok).toBe(true);
    expect(suspendUser).toHaveBeenCalledWith(USER_ID, 'spamming comments', undefined);
  });

  it('normalizes a missing reason to null rather than undefined', async () => {
    const suspendUser = jest.fn().mockResolvedValue(ok(undefined));
    const useCase = new SuspendUserUseCase(makeRepo(suspendUser));

    await useCase.execute({ userId: USER_ID });

    expect(suspendUser).toHaveBeenCalledWith(USER_ID, null, undefined);
  });

  it('propagates a repository failure', async () => {
    const suspendUser = jest.fn().mockResolvedValue(fail(new NotFoundFailure('errors.not_found.user')));
    const useCase = new SuspendUserUseCase(makeRepo(suspendUser));

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBeInstanceOf(NotFoundFailure);
  });
});
