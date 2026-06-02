import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { IRecipeRefiner, RefineRecipeResult } from '@application/ai/ports/i-recipe-refiner';
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

function successRefiner(recipe: GeneratedRecipeDto = BASE_AI_RECIPE): {
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
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
    },
  };
}

// ---- tests ------------------------------------------------------------------

describe('RefineRecipeUseCase — input validation', () => {
  it('returns UnprocessableFailure when instruction is empty string', async () => {
    const useCase = new RefineRecipeUseCase(successRefiner().port);

    const result = await useCase.execute(makeInput({ instruction: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.validation.prompt_required');
  });

  it('returns UnprocessableFailure when instruction is whitespace only', async () => {
    const useCase = new RefineRecipeUseCase(successRefiner().port);

    const result = await useCase.execute(makeInput({ instruction: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
  });

  it('does not call the refiner when instruction is blank', async () => {
    const refiner = successRefiner();
    const useCase = new RefineRecipeUseCase(refiner.port);

    await useCase.execute(makeInput({ instruction: '   ' }));

    expect(refiner.callCount()).toBe(0);
  });
});

describe('RefineRecipeUseCase — success', () => {
  it('returns ok with a RecipeDto when refiner succeeds', async () => {
    const useCase = new RefineRecipeUseCase(successRefiner().port);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Refined Pasta');
  });

  it('returned recipe has isPublished=false and moderationStatus=pending', async () => {
    const useCase = new RefineRecipeUseCase(successRefiner().port);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('calls the refiner with the trimmed instruction', async () => {
    const refiner = successRefiner();
    const useCase = new RefineRecipeUseCase(refiner.port);

    await useCase.execute(makeInput({ instruction: '  add lemon  ' }));

    expect(refiner.callCount()).toBe(1);
  });

  it('returned recipe maps locale correctly (name comes from AI title in given locale)', async () => {
    const useCase = new RefineRecipeUseCase(successRefiner().port);

    const result = await useCase.execute(makeInput({ locale: 'en' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The Recipe entity localizes name by locale key
    expect(result.value.name).toBe('Refined Pasta');
  });
});

describe('RefineRecipeUseCase — refiner failure', () => {
  it('propagates refiner failure', async () => {
    const useCase = new RefineRecipeUseCase(failingRefiner());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
  });
});

describe('RefineRecipeUseCase — cuisine/category enum fallback', () => {
  async function executeWithAiValues(
    cuisine: string,
    category: string,
  ): Promise<{ cuisine: string; category: string }> {
    const recipe = { ...BASE_AI_RECIPE, cuisine, category };
    const useCase = new RefineRecipeUseCase(successRefiner(recipe).port);
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
