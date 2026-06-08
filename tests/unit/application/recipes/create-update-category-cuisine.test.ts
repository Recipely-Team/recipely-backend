/**
 * Tests for the new required `category` and `cuisine` enum fields on
 * CreateRecipeUseCase and UpdateRecipeUseCase.
 *
 * The existing use-case test suites already cover the happy path and
 * moderation logic; this file covers the new required-field validation and
 * optional-field merge behaviour introduced by the filters/sort feature.
 */
import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, ValidationFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository, UserPreferences } from '@domain/recipes/i-recipe-repository';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import type { ILogger } from '@application/ports/i-logger';
import type { RecipePageResult, RecipeQuery, RecipeWithSocial } from '@domain/recipes/recipe-query';
import {
  CreateRecipeUseCase,
  type CreateRecipeInput,
} from '@application/recipes/use-cases/create-recipe-use-case';
import {
  UpdateRecipeUseCase,
  type UpdateRecipeInput,
} from '@application/recipes/use-cases/update-recipe-use-case';

// ---- fixtures ---------------------------------------------------------------

const OWNER_ID = 'owner-1';
const RECIPE_ID = 'recipe-1';

function makeRecipeProps(overrides: Partial<RecipeProps> = {}): RecipeProps {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: RECIPE_ID,
    ownerId: OWNER_ID,
    name: { en: 'Pasta' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta'] },
    instructions: { en: ['boil'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 0,
    image: 'https://example.com/img.jpg',
    rating: 0,
    tags: { en: [] },
    mealType: { en: [] },
    media: [],
    isPublished: true,
    moderationStatus: 'approved',
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeExistingRecipe(overrides: Partial<RecipeProps> = {}): Recipe {
  const result = Recipe.create(makeRecipeProps(overrides));
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

function approvedModerator(): IRecipeModerator {
  return {
    async moderate(_req: ModerateRecipeRequest) {
      return ok({ status: 'approved' });
    },
  };
}

function makeLogger(): ILogger {
  return { warn: jest.fn() };
}

function makeCreateRepo(capturedRef?: { recipe: Recipe | undefined }): IRecipeRepository {
  return {
    list: jest.fn<Promise<Result<RecipePageResult, Failure>>, [RecipeQuery]>(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn<Promise<Result<UserPreferences, Failure>>, [string]>(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),
    async create(recipe): Promise<Result<Recipe, Failure>> {
      if (capturedRef) capturedRef.recipe = recipe;
      return ok(recipe);
    },
  };
}

function makeUpdateRepo(existingRecipe: Recipe | null = makeExistingRecipe()): {
  repo: IRecipeRepository;
  capturedUpdate: () => Recipe | undefined;
} {
  let captured: Recipe | undefined;
  const repo: IRecipeRepository = {
    list: jest.fn<Promise<Result<RecipePageResult, Failure>>, [RecipeQuery]>(),
    create: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn<Promise<Result<UserPreferences, Failure>>, [string]>(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),

    async getById(id: string): Promise<Result<RecipeWithSocial, Failure>> {
      if (existingRecipe === null) return fail(new NotFoundFailure('errors.recipe.not_found'));
      if (id === existingRecipe.id) {
        return ok({ recipe: existingRecipe, social: { likeCount: 0, likedByMe: false, commentCount: 0 } });
      }
      return fail(new NotFoundFailure('errors.recipe.not_found'));
    },

    async update(recipe: Recipe): Promise<Result<Recipe, Failure>> {
      captured = recipe;
      return ok(recipe);
    },
  };
  return { repo, capturedUpdate: () => captured };
}

// ---- CreateRecipeUseCase — required category field --------------------------

describe('CreateRecipeUseCase — required category field', () => {
  it('persists the category enum value passed in input', async () => {
    const capturedRef = { recipe: undefined as Recipe | undefined };
    const repo = makeCreateRepo(capturedRef);
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger());

    await useCase.execute({
      ownerId: OWNER_ID,
      name: { en: 'Pasta' },
      cuisine: 'ITALIAN',
      category: 'DINNER',
      difficulty: 'EASY',
      ingredients: { en: ['pasta'] },
      instructions: { en: ['boil'] },
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      image: 'https://example.com/img.jpg',
    });

    expect(capturedRef.recipe?.category).toBe('DINNER');
  });

  it('persists the cuisine enum value passed in input', async () => {
    const capturedRef = { recipe: undefined as Recipe | undefined };
    const repo = makeCreateRepo(capturedRef);
    const useCase = new CreateRecipeUseCase(repo, approvedModerator(), makeLogger());

    await useCase.execute({
      ownerId: OWNER_ID,
      name: { en: 'Tacos' },
      cuisine: 'MEXICAN',
      category: 'MAIN_COURSE',
      difficulty: 'EASY',
      ingredients: { en: ['tortilla'] },
      instructions: { en: ['fill'] },
      prepTimeMinutes: 5,
      cookTimeMinutes: 10,
      image: 'https://example.com/img.jpg',
    });

    expect(capturedRef.recipe?.cuisine).toBe('MEXICAN');
  });
});

// ---- UpdateRecipeUseCase — optional category/cuisine field merging ----------

describe('UpdateRecipeUseCase — category and cuisine field merging', () => {
  it('keeps existing category when category is not in the update input', async () => {
    const existing = makeExistingRecipe({ category: 'DINNER' });
    const { repo, capturedUpdate } = makeUpdateRepo(existing);
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger());

    const input: UpdateRecipeInput = {
      id: RECIPE_ID,
      requesterId: OWNER_ID,
      cookTimeMinutes: 30,
    };

    await useCase.execute(input);

    expect(capturedUpdate()?.category).toBe('DINNER');
  });

  it('keeps existing cuisine when cuisine is not in the update input', async () => {
    const existing = makeExistingRecipe({ cuisine: 'TURKISH' });
    const { repo, capturedUpdate } = makeUpdateRepo(existing);
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger());

    const input: UpdateRecipeInput = {
      id: RECIPE_ID,
      requesterId: OWNER_ID,
      cookTimeMinutes: 30,
    };

    await useCase.execute(input);

    expect(capturedUpdate()?.cuisine).toBe('TURKISH');
  });

  it('applies the new category when category is in the update input', async () => {
    const existing = makeExistingRecipe({ category: 'DINNER' });
    const { repo, capturedUpdate } = makeUpdateRepo(existing);
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger());

    const input: UpdateRecipeInput = {
      id: RECIPE_ID,
      requesterId: OWNER_ID,
      category: 'DESSERT',
    };

    await useCase.execute(input);

    expect(capturedUpdate()?.category).toBe('DESSERT');
  });

  it('applies the new cuisine when cuisine is in the update input', async () => {
    const existing = makeExistingRecipe({ cuisine: 'ITALIAN' });
    const { repo, capturedUpdate } = makeUpdateRepo(existing);
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger());

    const input: UpdateRecipeInput = {
      id: RECIPE_ID,
      requesterId: OWNER_ID,
      cuisine: 'GREEK',
    };

    await useCase.execute(input);

    expect(capturedUpdate()?.cuisine).toBe('GREEK');
  });
});

// ---- UpdateRecipeUseCase — ValidationFailure propagation -------------------

describe('UpdateRecipeUseCase — ValidationFailure from Recipe.create during update', () => {
  it('returns ValidationFailure when merged props produce a negative prepTimeMinutes', async () => {
    const existing = makeExistingRecipe();
    const { repo } = makeUpdateRepo(existing);
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger());

    const result = await useCase.execute({
      id: RECIPE_ID,
      requesterId: OWNER_ID,
      prepTimeMinutes: -5,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBeInstanceOf(ValidationFailure);
  });
});
