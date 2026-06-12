import { ok, fail } from '@core/result/result';
import { ValidationFailure, UnprocessableFailure, UnknownFailure, type Failure } from '@core/failure';
import type { IAIGenerationLogRepository } from '@domain/ai/i-ai-generation-log-repository';
import type { AIGenerationLog } from '@domain/ai/ai-generation-log';
import type {
  IInstagramRecipeImporter,
  ImportInstagramRecipeRequest,
  ImportInstagramRecipeResult,
} from '@application/ai/ports/i-instagram-recipe-importer';
import type { ILogger } from '@application/ports/i-logger';
import {
  ImportInstagramRecipeUseCase,
  type ImportInstagramRecipeInput,
} from '@application/ai/use-cases/import-instagram-recipe-use-case';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';

// ---- fixtures ---------------------------------------------------------------

const BASE_AI_RECIPE: GeneratedRecipeDto = {
  title: 'Pasta Carbonara',
  cuisine: 'ITALIAN',
  category: 'PASTA',
  difficulty: 'EASY',
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  servings: 2,
  caloriesPerServing: 450,
  ingredients: ['pasta', 'eggs', 'guanciale', 'pecorino'],
  instructions: ['Boil pasta', 'Mix eggs and cheese', 'Combine with guanciale'],
  tags: ['quick', 'italian'],
  mealType: ['dinner'],
  nutrition: { protein: 20, carbs: 60, fat: 15, fiber: 2 },
};

function makeInput(overrides: Partial<ImportInstagramRecipeInput> = {}): ImportInstagramRecipeInput {
  return {
    ownerId: 'user-1',
    url: 'https://www.instagram.com/reel/abc123/',
    locale: 'en',
    ...overrides,
  };
}

function successfulImporter(recipe: GeneratedRecipeDto = BASE_AI_RECIPE): {
  importer: IInstagramRecipeImporter;
  calls: () => number;
} {
  let calls = 0;
  return {
    importer: {
      async import(_req: ImportInstagramRecipeRequest) {
        calls += 1;
        const result: ImportInstagramRecipeResult = {
          recipe,
          modelUsed: 'llama-4-scout',
          provider: 'groq',
        };
        return ok(result);
      },
    },
    calls: () => calls,
  };
}

function failingImporter(failure: Failure = new UnprocessableFailure('errors.import.no_recipe_found')): IInstagramRecipeImporter {
  return {
    async import(_req: ImportInstagramRecipeRequest) {
      return fail(failure);
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

function makeLogger(): ILogger {
  return { warn: jest.fn() };
}

// ---- URL validation ---------------------------------------------------------

describe('ImportInstagramRecipeUseCase — URL validation', () => {
  it('returns ValidationFailure when url is empty', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput({ url: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.import.invalid_url');
  });

  it('returns ValidationFailure when url is only whitespace', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput({ url: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.import.invalid_url');
  });

  it('returns ValidationFailure when url is not a valid URL', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput({ url: 'not-a-url' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.import.invalid_url');
  });

  it('returns ValidationFailure for a non-instagram host (youtube.com)', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput({ url: 'https://www.youtube.com/watch?v=abc123' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.import.not_instagram');
  });

  it('returns ValidationFailure for a non-instagram host (tiktok.com)', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput({ url: 'https://www.tiktok.com/@user/video/123' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.import.not_instagram');
  });

  it('calls the importer for instagram.com URLs', async () => {
    const imported = successfulImporter();
    const useCase = new ImportInstagramRecipeUseCase(
      imported.importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    await useCase.execute(makeInput({ url: 'https://instagram.com/reel/abc123/' }));

    expect(imported.calls()).toBe(1);
  });

  it('calls the importer for www.instagram.com URLs', async () => {
    const imported = successfulImporter();
    const useCase = new ImportInstagramRecipeUseCase(
      imported.importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    await useCase.execute(makeInput({ url: 'https://www.instagram.com/reel/xyz456/' }));

    expect(imported.calls()).toBe(1);
  });
});

// ---- importer failure propagation -------------------------------------------

describe('ImportInstagramRecipeUseCase — importer failure propagation', () => {
  it('propagates UnprocessableFailure no_recipe_found from the importer', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      failingImporter(new UnprocessableFailure('errors.import.no_recipe_found')),
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.import.no_recipe_found');
  });

  it('propagates UnprocessableFailure fetch_failed from the importer', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      failingImporter(new UnprocessableFailure('errors.import.fetch_failed')),
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.import.fetch_failed');
  });

  it('propagates UnprocessableFailure busy from the importer', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      failingImporter(new UnprocessableFailure('errors.import.busy')),
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.import.busy');
  });

  it('propagates UnknownFailure from the importer', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      failingImporter(new UnknownFailure('errors.ai.upstream_failed')),
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
  });

  it('writes a failure audit log when the importer fails', async () => {
    const logRepo = makeLogRepo();
    const useCase = new ImportInstagramRecipeUseCase(
      failingImporter(),
      logRepo.repo,
      makeLogger(),
    );

    await useCase.execute(makeInput());

    const logs = logRepo.logs();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.status).toBe('failed');
  });
});

// ---- happy path --------------------------------------------------------------

describe('ImportInstagramRecipeUseCase — happy path', () => {
  it('returns ok with a RecipeDto on success', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Pasta Carbonara');
  });

  it('maps the AI cuisine to the domain enum', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cuisine).toBe('ITALIAN');
  });

  it('maps the AI category to the domain enum', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe('PASTA');
  });

  it('sets moderationStatus to pending on the returned DTO', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('writes a success audit log', async () => {
    const logRepo = makeLogRepo();
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      logRepo.repo,
      makeLogger(),
    );

    await useCase.execute(makeInput());

    const logs = logRepo.logs();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.status).toBe('success');
  });

  it('falls back to OTHER when AI cuisine does not match any enum', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter({ ...BASE_AI_RECIPE, cuisine: 'FusionFood' }).importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cuisine).toBe('OTHER');
  });

  it('falls back to MAIN_COURSE when AI category does not match any enum', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter({ ...BASE_AI_RECIPE, category: 'Street Food' }).importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe('MAIN_COURSE');
  });

  it('normalises hyphenated cuisine to the enum (e.g. "MIDDLE-EASTERN" → MIDDLE_EASTERN)', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter({ ...BASE_AI_RECIPE, cuisine: 'MIDDLE-EASTERN' }).importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cuisine).toBe('MIDDLE_EASTERN');
  });
});

// ---- ValidationFailure field ------------------------------------------------

describe('ImportInstagramRecipeUseCase — ValidationFailure field', () => {
  it('ValidationFailure for empty url has field set to "url"', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput({ url: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const failure = result.failure as ValidationFailure;
    expect(failure.field).toBe('url');
  });

  it('ValidationFailure for non-instagram host has field set to "url"', async () => {
    const useCase = new ImportInstagramRecipeUseCase(
      successfulImporter().importer,
      makeLogRepo().repo,
      makeLogger(),
    );

    const result = await useCase.execute(makeInput({ url: 'https://facebook.com/video/123' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const failure = result.failure as ValidationFailure;
    expect(failure.field).toBe('url');
  });
});
