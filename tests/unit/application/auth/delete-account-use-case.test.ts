import { fail, ok } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import { CalendarDate } from '@domain/diary/calendar-date';
import { DeleteAccountUseCase } from '@application/auth/use-cases/delete-account-use-case';
import { InMemoryFoodDiaryRepository } from '../../fixtures/in-memory-food-diary-repository';
import { InMemoryInstagramConnections, connection } from '../../fixtures/instagram-fakes';

const USER = 'user-1';

const authRepo = (): AuthRepositoryInterface & { deleteAccount: jest.Mock } =>
  ({ deleteAccount: jest.fn().mockResolvedValue(ok(undefined)) }) as unknown as AuthRepositoryInterface & {
    deleteAccount: jest.Mock;
  };

// The account itself is tombstoned, but a food diary is health-like personal
// data with no audit value: deleting the account must drop it for real.
describe('DeleteAccountUseCase — food diary', () => {
  it('hard-deletes the diary and then tombstones the account', async () => {
    const auth = authRepo();
    const diary = new InMemoryFoodDiaryRepository();
    const day = CalendarDate.parse('2026-09-30');
    if (!day.ok) throw new Error('unreachable');
    await diary.setWater(USER, day.value, 3);

    const result = await new DeleteAccountUseCase(auth, diary, new InMemoryInstagramConnections()).execute({ userId: USER });

    expect(result.ok).toBe(true);
    expect(diary.purged).toEqual([USER]);
    expect(auth.deleteAccount).toHaveBeenCalledWith(USER);
  });

  it('keeps the account when the diary could not be purged, so the user can retry', async () => {
    const auth = authRepo();
    const diary = new InMemoryFoodDiaryRepository();
    jest.spyOn(diary, 'purgeUser').mockResolvedValue(fail(new UnknownFailure('db down')));

    const result = await new DeleteAccountUseCase(auth, diary, new InMemoryInstagramConnections()).execute({ userId: USER });

    expect(result.ok).toBe(false);
    expect(auth.deleteAccount).not.toHaveBeenCalled();
  });
});

// A stored Instagram token must not outlive its owner's account, and the
// comment-to-DM rules and history go with it.
describe('DeleteAccountUseCase — Instagram', () => {
  it('purges the Instagram link, rules and sends before tombstoning', async () => {
    const auth = authRepo();
    const instagram = new InMemoryInstagramConnections().seed(connection({ userId: USER }));
    const result = await new DeleteAccountUseCase(auth, new InMemoryFoodDiaryRepository(), instagram).execute({ userId: USER });
    expect(result.ok).toBe(true);
    expect(instagram.purged).toEqual([USER]);
    expect(auth.deleteAccount).toHaveBeenCalledWith(USER);
  });

  it('keeps the account when the Instagram data could not be purged', async () => {
    const auth = authRepo();
    const instagram = new InMemoryInstagramConnections();
    jest.spyOn(instagram, 'purgeUser').mockResolvedValue(fail(new UnknownFailure('db down')));
    const result = await new DeleteAccountUseCase(auth, new InMemoryFoodDiaryRepository(), instagram).execute({ userId: USER });
    expect(result.ok).toBe(false);
    expect(auth.deleteAccount).not.toHaveBeenCalled();
  });
});
