import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { IRecipeLikeRepository } from '@domain/likes/i-recipe-like-repository';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { UnlikeRecipeUseCase } from '@application/likes/use-cases/unlike-recipe-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const RECIPE_ID = 'recipe-uuid';

// ---- repo helpers ------------------------------------------------------------

function makeLikeRepo(options: {
  removeResult?: Result<void, Failure>;
} = {}): {
  likeRepo: IRecipeLikeRepository;
  removeCalls: () => Array<{ userId: string; recipeId: string }>;
} {
  const removeCalls: Array<{ userId: string; recipeId: string }> = [];
  const removeResult: Result<void, Failure> = options.removeResult ?? ok(undefined);

  const likeRepo: IRecipeLikeRepository = {
    add: jest.fn<Promise<Result<void, Failure>>, [string, string]>(),

    async remove(userId, recipeId): Promise<Result<void, Failure>> {
      removeCalls.push({ userId, recipeId });
      return removeResult;
    },
  };

  return { likeRepo, removeCalls: () => removeCalls };
}

// ---- tests ------------------------------------------------------------------

describe('UnlikeRecipeUseCase — happy path', () => {
  it('returns ok when likes.remove succeeds', async () => {
    const { likeRepo } = makeLikeRepo();
    const useCase = new UnlikeRecipeUseCase(likeRepo);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(true);
  });

  it('calls likes.remove once with the correct userId and recipeId', async () => {
    const { likeRepo, removeCalls } = makeLikeRepo();
    const useCase = new UnlikeRecipeUseCase(likeRepo);

    await useCase.execute(USER_ID, RECIPE_ID);

    expect(removeCalls()).toHaveLength(1);
    expect(removeCalls()[0]).toEqual({ userId: USER_ID, recipeId: RECIPE_ID });
  });
});

describe('UnlikeRecipeUseCase — likes.remove failure', () => {
  it('propagates the failure when likes.remove returns an error', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { likeRepo } = makeLikeRepo({ removeResult: fail(repoFailure) });
    const useCase = new UnlikeRecipeUseCase(likeRepo);

    const result = await useCase.execute(USER_ID, RECIPE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});

describe('UnlikeRecipeUseCase — no recipe existence check', () => {
  it('does not depend on IRecipeRepository — the use case has no recipe repo dependency', () => {
    // UnlikeRecipeUseCase constructor only accepts IRecipeLikeRepository.
    // This test confirms the design: unlike does not need a recipe existence check.
    const { likeRepo } = makeLikeRepo();
    const useCase = new UnlikeRecipeUseCase(likeRepo);

    expect(useCase).toBeDefined();
  });
});
