import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import type { IContentModerator } from '@application/moderation/ports/i-content-moderator';
import { WordListContentModerator } from '@infrastructure/moderation/word-list-content-moderator';
import type { ILogger } from '@application/ports/i-logger';
import { CreateRecipeUseCase, type CreateRecipeInput } from '@application/recipes/use-cases/create-recipe-use-case';

// ---- helpers ----------------------------------------------------------------

function makeInput(overrides: Partial<CreateRecipeInput> = {}): CreateRecipeInput {
  return {
    ownerId: 'user-1',
    name: { en: 'Pasta' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
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
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),
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

function approvingContentModerator(): IContentModerator {
  return { moderate: () => ({ status: 'approved' }) };
}

// ---- tests ------------------------------------------------------------------

describe('CreateRecipeUseCase — moderator approved path', () => {
  it('returns ok with a RecipeDto when moderator approves', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus approved when moderator approves', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('approved');
  });

  it('persists the recipe with isPublished true when moderator approves', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(true);
  });

  it('the returned DTO has moderationStatus approved', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('approved');
  });
});

describe('CreateRecipeUseCase — moderator rejected path', () => {
  it('returns ok (recipe still created) when moderator rejects', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger, approvingContentModerator());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus rejected when moderator rejects', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger, approvingContentModerator());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('rejected');
  });

  it('persists the recipe with isPublished false when moderator rejects', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger, approvingContentModerator());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(false);
  });
});

describe('CreateRecipeUseCase — moderator failure (pending) path', () => {
  it('returns ok even when the moderator returns a failure', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger, approvingContentModerator());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists the recipe with moderationStatus pending when moderator fails', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger, approvingContentModerator());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('pending');
  });

  it('persists the recipe with isPublished false when moderator fails', async () => {
    const { repo, capturedRecipe } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger, approvingContentModerator());

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(false);
  });

  it('the returned DTO has moderationStatus pending when moderator fails', async () => {
    const { repo } = makeRepo();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), makeLogger().logger, approvingContentModerator());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('calls logger.warn when the moderator returns a failure', async () => {
    const { repo } = makeRepo();
    const { logger, warn } = makeLogger();
    const useCase = new CreateRecipeUseCase(repo, failingModerator(), logger, approvingContentModerator());

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
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger().logger, approvingContentModerator());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});

describe('CreateRecipeUseCase — content moderation', () => {
  const realContentModerator = new WordListContentModerator();

  const makeUseCase = () => {
    const { repo, capturedRecipe } = makeRepo();
    const aiModerator = approvedModerator();
    const spy = jest.spyOn(aiModerator, 'moderate');
    return {
      useCase: new CreateRecipeUseCase(repo, aiModerator, makeLogger().logger, realContentModerator),
      capturedRecipe,
      spy,
    };
  };

  it('rejects profanity in the name and never persists', async () => {
    const { useCase, capturedRecipe, spy } = makeUseCase();

    const result = await useCase.execute(makeInput({ name: { en: 'siktir pasta' } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.content_blocked');
    expect(capturedRecipe()).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('checks every locale, not just the first', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute(makeInput({ name: { en: 'Pasta', tr: 'orospu makarna' } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.content_blocked');
  });

  it.each([
    ['ingredients', { ingredients: { tr: ['fare zehri', 'tuz'] } }],
    ['instructions', { instructions: { tr: ['çamaşır suyu ekle'] } }],
  ])('rejects a dangerous substance in %s with the recipe-specific message', async (_field, overrides) => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute(makeInput(overrides as Partial<CreateRecipeInput>));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.content_blocked_dangerous');
  });

  it('accepts an ordinary Turkish recipe', async () => {
    const { useCase, capturedRecipe } = makeUseCase();

    const result = await useCase.execute(
      makeInput({
        name: { tr: 'Limonlu Tavuk' },
        ingredients: { tr: ['tavuk', 'sıkılmış limon suyu', 'kaşar peyniri'] },
        instructions: { tr: ['Limonu iyice sık', 'Fırında pişir'] },
      }),
    );

    expect(result.ok).toBe(true);
    expect(capturedRecipe()).toBeDefined();
  });
});
