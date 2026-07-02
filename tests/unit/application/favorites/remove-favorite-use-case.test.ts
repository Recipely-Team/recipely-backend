import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { IFavoriteRepository } from '@domain/favorites/i-favorite-repository';
import { RemoveFavoriteUseCase } from '@application/favorites/use-cases/remove-favorite-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const RECIPE_ID = 'recipe-uuid';

interface RepoOptions {
  removeResult?: Result<void, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  favorites: IFavoriteRepository;
  removeCalls: () => Array<{ userId: string; recipeId: string }>;
} {
  const removeCalls: Array<{ userId: string; recipeId: string }> = [];

  const favorites: IFavoriteRepository = {
    add: jest.fn(),
    listForUser: jest.fn(),

    async remove(userId, recipeId): Promise<Result<void, Failure>> {
      removeCalls.push({ userId, recipeId });
      return options.removeResult ?? ok(undefined);
    },
  };

  return { favorites, removeCalls: () => removeCalls };
}

// ---- tests ------------------------------------------------------------------

describe('RemoveFavoriteUseCase', () => {
  it('returns ok and forwards userId and recipeId to the repository', async () => {
    const { favorites, removeCalls } = makeRepo();
    const useCase = new RemoveFavoriteUseCase(favorites);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(true);
    expect(removeCalls()).toEqual([{ userId: USER_ID, recipeId: RECIPE_ID }]);
  });

  it('remains ok when there was no favorite to remove (idempotent remove)', async () => {
    const { favorites } = makeRepo({ removeResult: ok(undefined) });
    const useCase = new RemoveFavoriteUseCase(favorites);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(true);
  });

  it('propagates the failure when the repository fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { favorites } = makeRepo({ removeResult: fail(repoFailure) });
    const useCase = new RemoveFavoriteUseCase(favorites);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
