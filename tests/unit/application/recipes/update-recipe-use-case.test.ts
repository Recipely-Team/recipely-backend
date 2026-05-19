import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, ValidationFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import type { ILogger } from '@application/ports/i-logger';
import { UpdateRecipeUseCase, type UpdateRecipeInput } from '@application/recipes/use-cases/update-recipe-use-case';
import type { RecipePageResult, RecipeQuery, RecipeWithSocial } from '@domain/recipes/recipe-query';

// ---- fixtures ---------------------------------------------------------------

const OWNER_ID = 'owner-uuid';
const RECIPE_ID = 'recipe-uuid';

function makeRecipeProps(overrides: Partial<RecipeProps> = {}): RecipeProps {
  return {
    id: RECIPE_ID,
    ownerId: OWNER_ID,
    name: { en: 'Pasta' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] },
    instructions: { en: ['boil', 'serve'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/pasta.jpg',
    rating: 4,
    tags: { en: ['quick'] },
    mealType: { en: ['dinner'] },
    media: [],
    isPublished: true,
    moderationStatus: 'approved',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeExistingRecipe(overrides: Partial<RecipeProps> = {}): Recipe {
  const result = Recipe.create(makeRecipeProps(overrides));
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

function makeInput(overrides: Partial<UpdateRecipeInput> = {}): UpdateRecipeInput {
  return {
    id: RECIPE_ID,
    requesterId: OWNER_ID,
    ...overrides,
  };
}

// ---- repo helpers -----------------------------------------------------------

interface RepoOptions {
  existingRecipe?: Recipe | null;
  updateOverride?: (recipe: Recipe) => Promise<Result<Recipe, Failure>>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IRecipeRepository;
  capturedUpdate: () => Recipe | undefined;
} {
  const existing = options.existingRecipe !== undefined ? options.existingRecipe : makeExistingRecipe();
  let capturedUpdate: Recipe | undefined;

  const repo: IRecipeRepository = {
    list: jest.fn<Promise<Result<RecipePageResult, Failure>>, [RecipeQuery]>(),
    create: jest.fn<Promise<Result<Recipe, Failure>>, [Recipe]>(),
    delete: jest.fn<Promise<Result<void, Failure>>, [string]>(),
    getPreferencesForUser: jest.fn(),

    async getById(id: string): Promise<Result<RecipeWithSocial, Failure>> {
      if (existing === null) {
        return fail(new NotFoundFailure('errors.recipe.not_found'));
      }
      if (id === existing.id) return ok({ recipe: existing, social: { likeCount: 0, likedByMe: false, commentCount: 0 } });
      return fail(new NotFoundFailure('errors.recipe.not_found'));
    },

    async update(recipe: Recipe): Promise<Result<Recipe, Failure>> {
      capturedUpdate = recipe;
      if (options.updateOverride) return options.updateOverride(recipe);
      return ok(recipe);
    },
  };

  return { repo, capturedUpdate: () => capturedUpdate };
}

// ---- moderator helpers ------------------------------------------------------

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

describe('UpdateRecipeUseCase — non-content field update (no moderation)', () => {
  it('returns ok with a RecipeDto when a non-content field is updated', async () => {
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput({ cookTimeMinutes: 30 }));

    expect(result.ok).toBe(true);
  });

  it('calls repo.update exactly once', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ cookTimeMinutes: 30 }));

    expect(capturedUpdate()).toBeDefined();
  });

  it('does not call moderator when only non-content fields change', async () => {
    const moderateSpy = jest.fn<Promise<Result<{ status: 'approved' }, Failure>>, [ModerateRecipeRequest]>(
      async () => ok({ status: 'approved' }),
    );
    const moderator: IRecipeModerator = { moderate: moderateSpy };
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, moderator, makeLogger().logger);

    await useCase.execute(makeInput({ cookTimeMinutes: 30 }));

    expect(moderateSpy).not.toHaveBeenCalled();
  });

  it('persists the updated cookTimeMinutes value', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ cookTimeMinutes: 45 }));

    expect(capturedUpdate()?.cookTimeMinutes).toBe(45);
  });
});

describe('UpdateRecipeUseCase — name changed (moderator approves)', () => {
  it('returns ok when name changes and moderator approves', async () => {
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput({ name: { en: 'New Pasta Name' } }));

    expect(result.ok).toBe(true);
  });

  it('persists recipe with moderationStatus approved when moderator approves', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ name: { en: 'New Pasta Name' } }));

    expect(capturedUpdate()?.moderationStatus).toBe('approved');
  });

  it('persists recipe with isPublished true when moderator approves', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ name: { en: 'New Pasta Name' } }));

    expect(capturedUpdate()?.isPublished).toBe(true);
  });

  it('calls the moderator when name field is updated', async () => {
    const moderateSpy = jest.fn<Promise<Result<{ status: 'approved' }, Failure>>, [ModerateRecipeRequest]>(
      async () => ok({ status: 'approved' }),
    );
    const moderator: IRecipeModerator = { moderate: moderateSpy };
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, moderator, makeLogger().logger);

    await useCase.execute(makeInput({ name: { en: 'New Pasta Name' } }));

    expect(moderateSpy).toHaveBeenCalledTimes(1);
  });
});

describe('UpdateRecipeUseCase — ingredients changed (moderator rejects)', () => {
  it('returns UnprocessableFailure when moderator rejects a content update', async () => {
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput({ ingredients: { en: ['suspect ingredient'] } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
  });

  it('does not call repo.update when moderator rejects the content update', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ ingredients: { en: ['suspect ingredient'] } }));

    expect(capturedUpdate()).toBeUndefined();
  });

  it('returns UnprocessableFailure with the recipe rejected message key', async () => {
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, rejectedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput({ ingredients: { en: ['suspect ingredient'] } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.recipe.rejected');
  });
});

describe('UpdateRecipeUseCase — instructions changed (moderator throws)', () => {
  it('returns ok even when the moderator returns a failure', async () => {
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, failingModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput({ instructions: { en: ['step 1', 'step 2'] } }));

    expect(result.ok).toBe(true);
  });

  it('persists recipe with moderationStatus pending when moderator fails', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, failingModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ instructions: { en: ['step 1', 'step 2'] } }));

    expect(capturedUpdate()?.moderationStatus).toBe('pending');
  });

  it('persists recipe with isPublished false when moderator fails', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, failingModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ instructions: { en: ['step 1', 'step 2'] } }));

    expect(capturedUpdate()?.isPublished).toBe(false);
  });

  it('calls logger.warn when the moderator returns a failure', async () => {
    const { repo } = makeRepo();
    const { logger, warn } = makeLogger();
    const useCase = new UpdateRecipeUseCase(repo, failingModerator(), logger);

    await useCase.execute(makeInput({ instructions: { en: ['step 1'] } }));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.any(String) }),
      expect.stringContaining('update_recipe_moderation_upstream_error'),
    );
  });

  it('does not propagate the moderator failure to the caller', async () => {
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, failingModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput({ instructions: { en: ['step 1'] } }));

    expect(result.ok).toBe(true);
  });
});

describe('UpdateRecipeUseCase — recipe not found', () => {
  it('returns NotFoundFailure when the recipe does not exist', async () => {
    const { repo } = makeRepo({ existingRecipe: null });
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('UpdateRecipeUseCase — non-owner update attempt', () => {
  it('returns ForbiddenFailure when a non-owner attempts to update', async () => {
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput({ requesterId: 'other-user-uuid' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
  });

  it('does not call the moderator when the requester is not the owner', async () => {
    const moderateSpy = jest.fn<Promise<Result<{ status: 'approved' }, Failure>>, [ModerateRecipeRequest]>(
      async () => ok({ status: 'approved' }),
    );
    const moderator: IRecipeModerator = { moderate: moderateSpy };
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, moderator, makeLogger().logger);

    await useCase.execute(makeInput({ requesterId: 'other-user-uuid', name: { en: 'Hacked Name' } }));

    expect(moderateSpy).not.toHaveBeenCalled();
  });

  it('does not call repo.update when the requester is not the owner', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ requesterId: 'other-user-uuid' }));

    expect(capturedUpdate()).toBeUndefined();
  });
});

describe('UpdateRecipeUseCase — repository update failure', () => {
  it('propagates the failure when repo.update fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ updateOverride: async () => fail(repoFailure) });
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    const result = await useCase.execute(makeInput({ cookTimeMinutes: 30 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});

describe('UpdateRecipeUseCase — Recipe.create validation failure', () => {
  it('returns ValidationFailure when merged props produce an invalid cookTimeMinutes', async () => {
    const { repo } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    // cookTimeMinutes: -1 fails Recipe.create validation (prep_time_invalid covers both)
    const result = await useCase.execute(makeInput({ cookTimeMinutes: -1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBeInstanceOf(ValidationFailure);
    expect(result.failure.code).toBe('validation');
  });

  it('does not call repo.update when Recipe.create returns a ValidationFailure', async () => {
    const { repo, capturedUpdate } = makeRepo();
    const useCase = new UpdateRecipeUseCase(repo, approvedModerator(), makeLogger().logger);

    await useCase.execute(makeInput({ cookTimeMinutes: -1 }));

    expect(capturedUpdate()).toBeUndefined();
  });
});
