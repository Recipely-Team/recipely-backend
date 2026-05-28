import { ok, fail } from '@core/result/result';
import { UnknownFailure, UnprocessableFailure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IAIGenerationLogRepository } from '@domain/ai/i-ai-generation-log-repository';
import type { IRecipeGenerator, GenerateRecipeResult } from '@application/ai/ports/i-recipe-generator';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import type { ILogger } from '@application/ports/i-logger';
import { GenerateRecipeUseCase, type GenerateRecipeInput } from '@application/ai/use-cases/generate-recipe-use-case';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';

// ---- helpers ----------------------------------------------------------------

const BASE_AI_RECIPE: GeneratedRecipeDto = {
  title: 'AI Pasta',
  cuisine: 'ITALIAN',
  category: 'PASTA',
  difficulty: 'EASY',
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  servings: 2,
  caloriesPerServing: 400,
  ingredients: ['pasta', 'sauce'],
  instructions: ['boil', 'serve'],
  tags: ['quick'],
  mealType: ['dinner'],
  nutrition: { protein: 0, carbs: 0, fat: 0, fiber: 0 },
};

function makeInput(overrides: Partial<GenerateRecipeInput> = {}): GenerateRecipeInput {
  return {
    ownerId: 'user-1',
    prompt: 'make me a pasta dish',
    locale: 'en',
    ...overrides,
  };
}

function successfulGenerator(recipe: GeneratedRecipeDto = BASE_AI_RECIPE): IRecipeGenerator {
  return {
    async generate() {
      const result: GenerateRecipeResult = { recipe, modelUsed: 'test-model', provider: 'test' };
      return ok(result);
    },
  };
}

function failingGenerator(): IRecipeGenerator {
  return {
    async generate() {
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
    },
  };
}

/** Captures the last recipe passed to create() so tests can inspect it. */
function makeRecipeRepo(): {
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
    async create(recipe) {
      captured = recipe;
      return ok(recipe);
    },
  };
  return { repo, capturedRecipe: () => captured };
}

function makeLogRepo(): IAIGenerationLogRepository {
  return {
    async create(log) {
      return ok(log);
    },
  };
}

function approvedModerator(): IRecipeModerator {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return ok({ status: 'approved' });
    },
  };
}

function rejectedModerator(reason = 'unsafe'): IRecipeModerator {
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

describe('GenerateRecipeUseCase — input validation', () => {
  it('returns UnprocessableFailure when prompt is empty', async () => {
    const { repo } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput({ prompt: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.validation.prompt_required');
  });
});

describe('GenerateRecipeUseCase — generator failure', () => {
  it('propagates generator failure without saving a recipe', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      failingGenerator(),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    expect(capturedRecipe()).toBeUndefined();
  });
});

describe('GenerateRecipeUseCase — moderator approved path', () => {
  it('returns ok when moderator approves', async () => {
    const { repo } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists recipe with moderationStatus approved when moderator approves', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('approved');
  });

  it('persists recipe with isPublished true when moderator approves', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(true);
  });
});

describe('GenerateRecipeUseCase — moderator rejected path', () => {
  it('returns ok (recipe still created) when moderator rejects', async () => {
    const { repo } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      rejectedModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists recipe with moderationStatus rejected when moderator rejects', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      rejectedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('rejected');
  });

  it('persists recipe with isPublished false when moderator rejects', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      rejectedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(false);
  });
});

describe('GenerateRecipeUseCase — moderator failure (pending) path', () => {
  it('returns ok even when moderator returns a failure', async () => {
    const { repo } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      failingModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('persists recipe with moderationStatus pending when moderator fails', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      failingModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.moderationStatus).toBe('pending');
  });

  it('persists recipe with isPublished false when moderator fails', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      failingModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.isPublished).toBe(false);
  });

  it('the returned DTO has moderationStatus pending when moderator fails', async () => {
    const { repo } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      failingModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('calls logger.warn when the moderator returns a failure', async () => {
    const { repo } = makeRecipeRepo();
    const { logger, warn } = makeLogger();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator(),
      repo,
      makeLogRepo(),
      failingModerator(),
      logger,
    );

    await useCase.execute(makeInput());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.any(String) }),
      expect.stringContaining('generate_recipe_moderation_upstream_error'),
    );
  });
});

describe('GenerateRecipeUseCase — cuisine/category enum mapping', () => {
  it('uses the AI-provided category instead of hardcoding MAIN_COURSE', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator({ ...BASE_AI_RECIPE, category: 'DESSERT' }),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.category).toBe('DESSERT');
  });

  it('uses the AI-provided cuisine when it matches the enum', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator({ ...BASE_AI_RECIPE, cuisine: 'TURKISH' }),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.cuisine).toBe('TURKISH');
  });

  it('normalises lower-case / spaced cuisine to the enum (e.g. "middle eastern" → MIDDLE_EASTERN)', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator({ ...BASE_AI_RECIPE, cuisine: 'middle eastern' }),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.cuisine).toBe('MIDDLE_EASTERN');
  });

  it('falls back to OTHER when cuisine does not match any enum value (localized text)', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator({ ...BASE_AI_RECIPE, cuisine: 'İtalyan' }),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.cuisine).toBe('OTHER');
  });

  it('falls back to MAIN_COURSE when category does not match any enum value', async () => {
    const { repo, capturedRecipe } = makeRecipeRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator({ ...BASE_AI_RECIPE, category: 'Ana Yemek' }),
      repo,
      makeLogRepo(),
      approvedModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    expect(capturedRecipe()?.category).toBe('MAIN_COURSE');
  });
});
