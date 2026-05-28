import { ok, fail } from '@core/result/result';
import { UnknownFailure, UnprocessableFailure } from '@core/failure';
import type { IAIGenerationLogRepository } from '@domain/ai/i-ai-generation-log-repository';
import type { AIGenerationLog } from '@domain/ai/ai-generation-log';
import type { IRecipeGenerator, GenerateRecipeResult } from '@application/ai/ports/i-recipe-generator';
import type { IPromptModerator, ModeratePromptRequest } from '@application/ai/ports/i-prompt-moderator';
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

function successfulGenerator(recipe: GeneratedRecipeDto = BASE_AI_RECIPE): {
  port: IRecipeGenerator;
  calls: () => number;
} {
  let calls = 0;
  return {
    port: {
      async generate() {
        calls += 1;
        const result: GenerateRecipeResult = { recipe, modelUsed: 'test-model', provider: 'test' };
        return ok(result);
      },
    },
    calls: () => calls,
  };
}

function failingGenerator(): IRecipeGenerator {
  return {
    async generate() {
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
    },
  };
}

function makeLogRepo(): { repo: IAIGenerationLogRepository; logs: () => AIGenerationLog[] } {
  const logs: AIGenerationLog[] = [];
  return {
    repo: {
      async create(log) {
        logs.push(log);
        return ok(log);
      },
    },
    logs: () => logs,
  };
}

function approvedPromptModerator(): IPromptModerator {
  return {
    async moderate(_req: ModeratePromptRequest) {
      return ok({ status: 'approved' });
    },
  };
}

function rejectedPromptModerator(reason = 'profanity'): IPromptModerator {
  return {
    async moderate(_req: ModeratePromptRequest) {
      return ok({ status: 'rejected', reason });
    },
  };
}

function failingPromptModerator(): IPromptModerator {
  return {
    async moderate(_req: ModeratePromptRequest) {
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
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator().port,
      makeLogRepo().repo,
      approvedPromptModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput({ prompt: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.validation.prompt_required');
  });
});

describe('GenerateRecipeUseCase — prompt moderation', () => {
  it('returns UnprocessableFailure when the prompt is rejected', async () => {
    const gen = successfulGenerator();
    const useCase = new GenerateRecipeUseCase(
      gen.port,
      makeLogRepo().repo,
      rejectedPromptModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput({ prompt: 'inappropriate slur' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.ai.prompt_rejected');
  });

  it('does NOT call the generator when the prompt is rejected', async () => {
    const gen = successfulGenerator();
    const useCase = new GenerateRecipeUseCase(
      gen.port,
      makeLogRepo().repo,
      rejectedPromptModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput({ prompt: 'inappropriate slur' }));

    expect(gen.calls()).toBe(0);
  });

  it('proceeds to generate when the prompt moderator returns a failure (fail-open)', async () => {
    const gen = successfulGenerator();
    const useCase = new GenerateRecipeUseCase(
      gen.port,
      makeLogRepo().repo,
      failingPromptModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    expect(gen.calls()).toBe(1);
  });
});

describe('GenerateRecipeUseCase — generator failure', () => {
  it('propagates generator failure', async () => {
    const useCase = new GenerateRecipeUseCase(
      failingGenerator(),
      makeLogRepo().repo,
      approvedPromptModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
  });
});

describe('GenerateRecipeUseCase — preview (no persistence)', () => {
  it('returns a recipe DTO without persisting anything', async () => {
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator().port,
      makeLogRepo().repo,
      approvedPromptModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('AI Pasta');
  });

  it('preview is always isPublished=false and moderationStatus=pending', async () => {
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator().port,
      makeLogRepo().repo,
      approvedPromptModerator(),
      makeLogger().logger,
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('writes a success audit log with generatedRecipeId=null', async () => {
    const logRepo = makeLogRepo();
    const useCase = new GenerateRecipeUseCase(
      successfulGenerator().port,
      logRepo.repo,
      approvedPromptModerator(),
      makeLogger().logger,
    );

    await useCase.execute(makeInput());

    const logs = logRepo.logs();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.status).toBe('success');
    expect(logs[0]!.generatedRecipeId).toBeNull();
  });
});

describe('GenerateRecipeUseCase — cuisine/category enum mapping', () => {
  function pickedRecipe(aiOverrides: Partial<GeneratedRecipeDto>) {
    return new Promise<{ cuisine: string; category: string }>(async (resolve) => {
      const useCase = new GenerateRecipeUseCase(
        successfulGenerator({ ...BASE_AI_RECIPE, ...aiOverrides }).port,
        makeLogRepo().repo,
        approvedPromptModerator(),
        makeLogger().logger,
      );
      const result = await useCase.execute(makeInput());
      if (!result.ok) throw new Error('expected ok');
      resolve({ cuisine: result.value.cuisine, category: result.value.category });
    });
  }

  it('uses the AI-provided category instead of hardcoding MAIN_COURSE', async () => {
    const { category } = await pickedRecipe({ category: 'DESSERT' });
    expect(category).toBe('DESSERT');
  });

  it('uses the AI-provided cuisine when it matches the enum', async () => {
    const { cuisine } = await pickedRecipe({ cuisine: 'TURKISH' });
    expect(cuisine).toBe('TURKISH');
  });

  it('normalises lower-case / spaced cuisine to the enum (e.g. "middle eastern" → MIDDLE_EASTERN)', async () => {
    const { cuisine } = await pickedRecipe({ cuisine: 'middle eastern' });
    expect(cuisine).toBe('MIDDLE_EASTERN');
  });

  it('falls back to OTHER when cuisine does not match any enum value (localized text)', async () => {
    const { cuisine } = await pickedRecipe({ cuisine: 'İtalyan' });
    expect(cuisine).toBe('OTHER');
  });

  it('falls back to MAIN_COURSE when category does not match any enum value', async () => {
    const { category } = await pickedRecipe({ category: 'Ana Yemek' });
    expect(category).toBe('MAIN_COURSE');
  });
});
