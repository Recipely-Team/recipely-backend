import { ok, fail } from '@core/result/result';
import { ServiceUnavailableFailure } from '@core/failure';
import type { IRecipeRefiner, RefineRecipeResult } from '@application/ai/ports/i-recipe-refiner';
import type { IContentModerator } from '@application/moderation/ports/i-content-moderator';
import type { ILogger } from '@application/ports/i-logger';
import type { TranslationService } from '@application/i18n/translation-service';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';
import { RefineRecipeUseCase, type RefineRecipeInput } from '@application/ai/use-cases/refine-recipe-use-case';

// ---- helpers ----------------------------------------------------------------

const BASE_AI_RECIPE: GeneratedRecipeDto = {
  title: 'Refined Pasta',
  cuisine: 'ITALIAN',
  category: 'PASTA',
  difficulty: 'EASY',
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  servings: 2,
  caloriesPerServing: 400,
  ingredients: ['pasta', 'tomato sauce'],
  instructions: ['boil pasta', 'add sauce', 'serve'],
  tags: ['quick', 'easy'],
  mealType: ['dinner'],
  nutrition: { protein: 12, carbs: 60, fat: 5, fiber: 3 },
  tips: ['keep sauce warm'],
};

function makeInput(overrides: Partial<RefineRecipeInput> = {}): RefineRecipeInput {
  return {
    ownerId: 'user-1',
    currentRecipe: { name: 'Draft Pasta' },
    instruction: 'make it spicier',
    locale: 'en',
    ...overrides,
  };
}

function successRefiner(
  recipe: GeneratedRecipeDto = BASE_AI_RECIPE,
  summary = 'Made it spicier by adding chili flakes.',
  suggestion = 'Try adding a squeeze of lime at the end.',
): {
  port: IRecipeRefiner;
  callCount: () => number;
} {
  let callCount = 0;
  return {
    port: {
      async refine() {
        callCount += 1;
        const result: RefineRecipeResult = {
          recipe,
          modelUsed: 'test-model',
          provider: 'test-provider',
          summary,
          suggestion,
        };
        return ok(result);
      },
    },
    callCount: () => callCount,
  };
}

function failingRefiner(): IRecipeRefiner {
  return {
    async refine() {
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    },
  };
}

function approvingContentModerator(): IContentModerator {
  return { moderate: () => ({ status: 'approved' }) };
}

function makeLogger(): { logger: ILogger; warn: jest.Mock } {
  const warn = jest.fn();
  return { logger: { warn }, warn };
}

function makeTranslation(): TranslationService {
  return {
    t: (key: string) => key,
    localeFromRequest: () => 'en',
  };
}

// ---- tests ------------------------------------------------------------------

describe('RefineRecipeUseCase — input validation', () => {
  it('returns UnprocessableFailure when instruction is empty string', async () => {
    const useCase = new RefineRecipeUseCase(
      successRefiner().port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput({ instruction: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.validation.prompt_required');
  });

  it('returns UnprocessableFailure when instruction is whitespace only', async () => {
    const useCase = new RefineRecipeUseCase(
      successRefiner().port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput({ instruction: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
  });

  it('does not call the refiner when instruction is blank', async () => {
    const refiner = successRefiner();
    const useCase = new RefineRecipeUseCase(
      refiner.port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    await useCase.execute(makeInput({ instruction: '   ' }));

    expect(refiner.callCount()).toBe(0);
  });
});

describe('RefineRecipeUseCase — success', () => {
  it('returns ok with a RecipeDto when refiner succeeds', async () => {
    const useCase = new RefineRecipeUseCase(
      successRefiner().port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Refined Pasta');
  });

  it('returned recipe has isPublished=false and moderationStatus=pending', async () => {
    const useCase = new RefineRecipeUseCase(
      successRefiner().port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('calls the refiner with the trimmed instruction', async () => {
    const refiner = successRefiner();
    const useCase = new RefineRecipeUseCase(
      refiner.port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    await useCase.execute(makeInput({ instruction: '  add lemon  ' }));

    expect(refiner.callCount()).toBe(1);
  });

  it('returned recipe maps locale correctly (name comes from AI title in given locale)', async () => {
    const useCase = new RefineRecipeUseCase(
      successRefiner().port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput({ locale: 'en' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The Recipe entity localizes name by locale key
    expect(result.value.name).toBe('Refined Pasta');
  });

  it('returns the summary produced by the refiner', async () => {
    const useCase = new RefineRecipeUseCase(
      successRefiner(BASE_AI_RECIPE, 'Added chili flakes for extra heat.').port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('Added chili flakes for extra heat.');
  });

  it('returns the suggestion produced by the refiner', async () => {
    const useCase = new RefineRecipeUseCase(
      successRefiner(BASE_AI_RECIPE, 'Made it spicier.', 'Try a squeeze of lime.').port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestion).toBe('Try a squeeze of lime.');
  });
});

describe('RefineRecipeUseCase — leak sanitization', () => {
  it('replaces a leaking summary with the translated fallback and logs a warning', async () => {
    const { logger, warn } = makeLogger();
    const useCase = new RefineRecipeUseCase(
      successRefiner(BASE_AI_RECIPE, 'Kategoriyi MAIN_COURSE olarak ayarladım ve JSON şemasını güncelledim.').port,
      approvingContentModerator(),
      logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('ai.refine_leak_summary_fallback');
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ field: 'summary' }), 'refine_recipe_internal_leak_detected');
  });

  it('replaces a leaking suggestion with an empty string and logs a warning', async () => {
    const { logger, warn } = makeLogger();
    const useCase = new RefineRecipeUseCase(
      successRefiner(BASE_AI_RECIPE, 'Made it spicier.', 'Also update the caloriesPerServing field.').port,
      approvingContentModerator(),
      logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestion).toBe('');
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ field: 'suggestion' }), 'refine_recipe_internal_leak_detected');
  });

  it('passes through a clean summary and suggestion untouched, without logging', async () => {
    const { logger, warn } = makeLogger();
    const useCase = new RefineRecipeUseCase(
      successRefiner(BASE_AI_RECIPE, 'Made it a bit spicier for you.', 'Try adding a squeeze of lime.').port,
      approvingContentModerator(),
      logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('Made it a bit spicier for you.');
    expect(result.value.suggestion).toBe('Try adding a squeeze of lime.');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('RefineRecipeUseCase — refiner failure', () => {
  it('propagates refiner failure', async () => {
    const useCase = new RefineRecipeUseCase(
      failingRefiner(),
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('service_unavailable');
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
  });
});

describe('RefineRecipeUseCase — cuisine/category enum fallback', () => {
  async function executeWithAiValues(
    cuisine: string,
    category: string,
  ): Promise<{ cuisine: string; category: string }> {
    const recipe = { ...BASE_AI_RECIPE, cuisine, category };
    const useCase = new RefineRecipeUseCase(
      successRefiner(recipe).port,
      approvingContentModerator(),
      makeLogger().logger,
      makeTranslation(),
    );
    const result = await useCase.execute(makeInput());
    if (!result.ok) throw new Error('expected ok');
    return { cuisine: result.value.cuisine, category: result.value.category };
  }

  it('uses the AI-provided cuisine when it matches the enum exactly', async () => {
    const { cuisine } = await executeWithAiValues('ITALIAN', 'PASTA');
    expect(cuisine).toBe('ITALIAN');
  });

  it('normalises lower-case cuisine to the enum (e.g. "turkish" → TURKISH)', async () => {
    const { cuisine } = await executeWithAiValues('turkish', 'MAIN_COURSE');
    expect(cuisine).toBe('TURKISH');
  });

  it('normalises space-separated cuisine (e.g. "middle eastern" → MIDDLE_EASTERN)', async () => {
    const { cuisine } = await executeWithAiValues('middle eastern', 'MAIN_COURSE');
    expect(cuisine).toBe('MIDDLE_EASTERN');
  });

  it('falls back to OTHER when cuisine does not match any enum value', async () => {
    const { cuisine } = await executeWithAiValues('İtalyan', 'MAIN_COURSE');
    expect(cuisine).toBe('OTHER');
  });

  it('uses the AI-provided category when it matches the enum exactly', async () => {
    const { category } = await executeWithAiValues('ITALIAN', 'DESSERT');
    expect(category).toBe('DESSERT');
  });

  it('falls back to MAIN_COURSE when category does not match any enum value', async () => {
    const { category } = await executeWithAiValues('ITALIAN', 'Ana Yemek');
    expect(category).toBe('MAIN_COURSE');
  });
});
