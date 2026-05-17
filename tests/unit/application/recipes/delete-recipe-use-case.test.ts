import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import { DeleteRecipeUseCase, type DeleteRecipeInput } from '@application/recipes/use-cases/delete-recipe-use-case';
import type { RecipePageResult, RecipeQuery, RecipeWithSocial } from '@domain/recipes/recipe-query';

// ---- fixtures ---------------------------------------------------------------

const OWNER_ID = 'owner-uuid';
const RECIPE_ID = 'recipe-uuid';

function makeRecipeProps(overrides: Partial<RecipeProps> = {}): RecipeProps {
  return {
    id: RECIPE_ID,
    ownerId: OWNER_ID,
    name: { en: 'Pasta' },
    cuisine: { en: 'Italian' },
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

function makeInput(overrides: Partial<DeleteRecipeInput> = {}): DeleteRecipeInput {
  return {
    id: RECIPE_ID,
    requesterId: OWNER_ID,
    ...overrides,
  };
}

// ---- repo helpers -----------------------------------------------------------

interface RepoOptions {
  existingRecipe?: Recipe | null;
  deleteOverride?: (id: string) => Promise<Result<void, Failure>>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IRecipeRepository;
  deleteCalled: () => boolean;
  deletedId: () => string | undefined;
} {
  const existing = options.existingRecipe !== undefined ? options.existingRecipe : makeExistingRecipe();
  let deleteCalled = false;
  let deletedId: string | undefined;

  const repo: IRecipeRepository = {
    list: jest.fn<Promise<Result<RecipePageResult, Failure>>, [RecipeQuery]>(),
    create: jest.fn<Promise<Result<Recipe, Failure>>, [Recipe]>(),
    update: jest.fn<Promise<Result<Recipe, Failure>>, [Recipe]>(),

    async getById(id: string): Promise<Result<RecipeWithSocial, Failure>> {
      if (existing === null) {
        return fail(new NotFoundFailure('errors.recipe.not_found'));
      }
      if (id === existing.id) return ok({ recipe: existing, social: { likeCount: 0, likedByMe: false } });
      return fail(new NotFoundFailure('errors.recipe.not_found'));
    },

    async delete(id: string): Promise<Result<void, Failure>> {
      deleteCalled = true;
      deletedId = id;
      if (options.deleteOverride) return options.deleteOverride(id);
      return ok(undefined);
    },
  };

  return {
    repo,
    deleteCalled: () => deleteCalled,
    deletedId: () => deletedId,
  };
}

// ---- tests ------------------------------------------------------------------

describe('DeleteRecipeUseCase — happy path', () => {
  it('returns ok when the owner deletes their recipe', async () => {
    const { repo } = makeRepo();
    const useCase = new DeleteRecipeUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('calls repo.delete with the correct recipe id', async () => {
    const { repo, deletedId } = makeRepo();
    const useCase = new DeleteRecipeUseCase(repo);

    await useCase.execute(makeInput());

    expect(deletedId()).toBe(RECIPE_ID);
  });
});

describe('DeleteRecipeUseCase — recipe not found', () => {
  it('returns NotFoundFailure when the recipe does not exist', async () => {
    const { repo } = makeRepo({ existingRecipe: null });
    const useCase = new DeleteRecipeUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });

  it('does not call repo.delete when the recipe is not found', async () => {
    const { repo, deleteCalled } = makeRepo({ existingRecipe: null });
    const useCase = new DeleteRecipeUseCase(repo);

    await useCase.execute(makeInput());

    expect(deleteCalled()).toBe(false);
  });
});

describe('DeleteRecipeUseCase — non-owner delete attempt', () => {
  it('returns ForbiddenFailure when a non-owner attempts to delete', async () => {
    const { repo } = makeRepo();
    const useCase = new DeleteRecipeUseCase(repo);

    const result = await useCase.execute(makeInput({ requesterId: 'other-user-uuid' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
  });

  it('does not call repo.delete when the requester is not the owner', async () => {
    const { repo, deleteCalled } = makeRepo();
    const useCase = new DeleteRecipeUseCase(repo);

    await useCase.execute(makeInput({ requesterId: 'other-user-uuid' }));

    expect(deleteCalled()).toBe(false);
  });
});

describe('DeleteRecipeUseCase — already soft-deleted recipe', () => {
  it('returns NotFoundFailure when the recipe was previously soft-deleted (non-idempotent)', async () => {
    // The repo's getById filters out soft-deleted rows, so a previously
    // soft-deleted recipe is indistinguishable from a never-existing one at
    // the use-case layer — the decision to be non-idempotent is enforced here.
    const { repo } = makeRepo({ existingRecipe: null });
    const useCase = new DeleteRecipeUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('DeleteRecipeUseCase — repository delete failure', () => {
  it('propagates the failure when repo.delete fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ deleteOverride: async () => fail(repoFailure) });
    const useCase = new DeleteRecipeUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
