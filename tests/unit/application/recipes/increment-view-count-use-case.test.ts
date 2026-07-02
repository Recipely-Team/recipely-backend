import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import { IncrementViewCountUseCase } from '@application/recipes/use-cases/increment-view-count-use-case';

// ---- fixtures ----------------------------------------------------------------

const RECIPE_ID = 'recipe-uuid';

interface RepoOptions {
  incrementResult?: Result<void, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IRecipeRepository;
  incrementCalls: () => string[];
} {
  const incrementCalls: string[] = [];

  const repo: IRecipeRepository = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),

    async incrementViewCount(recipeId): Promise<Result<void, Failure>> {
      incrementCalls.push(recipeId);
      return options.incrementResult ?? ok(undefined);
    },
  };

  return { repo, incrementCalls: () => incrementCalls };
}

// ---- tests ------------------------------------------------------------------

describe('IncrementViewCountUseCase', () => {
  it('returns ok and forwards the recipe id to the repository', async () => {
    const { repo, incrementCalls } = makeRepo();
    const useCase = new IncrementViewCountUseCase(repo);

    const result = await useCase.execute({ recipeId: RECIPE_ID });

    expect(result.ok).toBe(true);
    expect(incrementCalls()).toEqual([RECIPE_ID]);
  });

  it('propagates NotFoundFailure for a nonexistent recipe', async () => {
    const notFound = new NotFoundFailure('errors.not_found.recipe');
    const { repo } = makeRepo({ incrementResult: fail(notFound) });
    const useCase = new IncrementViewCountUseCase(repo);

    const result = await useCase.execute({ recipeId: 'missing' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });

  it('propagates unknown repository failures', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ incrementResult: fail(repoFailure) });
    const useCase = new IncrementViewCountUseCase(repo);

    const result = await useCase.execute({ recipeId: RECIPE_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
