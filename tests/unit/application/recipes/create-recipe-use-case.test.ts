import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import type { ILogger } from '@application/ports/i-logger';
import { CreateRecipeUseCase, type CreateRecipeInput } from '@application/recipes/use-cases/create-recipe-use-case';

// ---- helpers ----------------------------------------------------------------

function makeInput(overrides: Partial<CreateRecipeInput> = {}): CreateRecipeInput {
  return {
    ownerId: 'user-1',
    name: { en: 'Pasta' },
    cuisine: { en: 'Italian' },
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] },
    instructions: { en: ['boil', 'serve'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    image: 'https://example.com/pasta.jpg',
    ...overrides,
  };
}

/** Captures the last recipe passed to create() so tests can inspect it. */
function makeRepo(createOverride?: (recipe: Recipe) => Promise<Result<Recipe, Failure>>): {
  repo: IRecipeRepository;
  capturedRecipe: () => Recipe | undefined;
} {
  let captured: Recipe | undefined;

  const repo: IRecipeRepository = {
    list: jest.fn(),
    getById: jest.fn(),
    async create(recipe): Promise<Result<Recipe, Failure>> {
      captured = recipe;
      if (createOverride) return createOverride(recipe);
      return ok(recipe);
    },
  };

  return { repo, capturedRecipe: () => captured };
}

function approvedModerator(): IRecipeModerator {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return ok({ status: 'approved' });
    },
  };
}

function rejectedModerator(reason = 'unsafe content'): IRecipeModerator {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return ok({ status: 'rejected', reason });
    },
  };
}

function failingModerator(): IRecipeModerator {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
    },
  };
}

function makeLogger(): { logger: ILogger; warn: jest.Mock } {
  const warn = jest.fn();
  return { logger: { warn }, warn };
}

// ---- tests ------------------------------------------------------------------

describe('CreateRecipeUseCase — moderator approved path', () => {
  it('returns ok with a RecipeDto when moderator approves', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus approved when moderator approves', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('approved');
  });

  it('persists the recipe with isPublished true when moderator approves', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(true);
  });

  it('the returned DTO has moderationStatus approved', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('approved');
  });
});

describe('CreateRecipeUseCase — moderator rejected path', () => {
  it('returns ok (recipe still created) when moderator rejects', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus rejected when moderator rejects', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger);

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('rejected');
  });

  it('persists the recipe with isPublished false when moderator rejects', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger);

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(false);
  });
});

describe('CreateRecipeUseCase — moderator failure (pending) path', () => {
  it('returns ok even when the moderator returns a failure', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus pending when moderator fails', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger);

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('pending');
  });

  it('persists the recipe with isPublished false when moderator fails', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger);

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(false);
  });

  it('the returned DTO has moderationStatus pending when moderator fails', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('calls logger.warn when the moderator returns a failure', async () => {
    const { repo } = makeRepo();
    const { logger, warn } = makeLogger();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), logger);

    await useCase.execute(makeInput());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.any(String) }),
      expect.stringContaining('create_recipe_moderation_upstream_error'),
    );
  });
});

describe('CreateRecipeUseCase — repository failure', () => {
  it('propagates the repository failure when create fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo(async () => fail(repoFailure));
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
