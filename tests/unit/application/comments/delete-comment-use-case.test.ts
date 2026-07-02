import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { RecipeWithSocial } from '@domain/recipes/recipe-query';
import { Comment, type CommentProps } from '@domain/comments/comment';
import type { ICommentRepository, CommentPageResult } from '@domain/comments/i-comment-repository';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { DeleteCommentUseCase, type DeleteCommentInput } from '@application/comments/use-cases/delete-comment-use-case';

// ---- fixtures ----------------------------------------------------------------

const COMMENT_ID = 'comment-uuid';
const RECIPE_ID = 'recipe-uuid';
const AUTHOR_ID = 'author-uuid';
const OWNER_ID = 'owner-uuid';
const STRANGER_ID = 'stranger-uuid';

function makeCommentProps(overrides: Partial<CommentProps> = {}): CommentProps {
  return {
    id: COMMENT_ID,
    body: 'Looks delicious',
    moderationStatus: 'approved',
    recipeId: RECIPE_ID,
    authorId: AUTHOR_ID,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeComment(overrides: Partial<CommentProps> = {}): Comment {
  const result = Comment.create(makeCommentProps(overrides));
  if (!result.ok) throw new Error('fixture comment invalid: ' + result.failure.messageKey);
  return result.value;
}

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
    viewCount: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<RecipeProps> = {}): Recipe {
  const result = Recipe.create(makeRecipeProps(overrides));
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

const withSocial = (recipe: Recipe): RecipeWithSocial => ({
  recipe,
  social: { likeCount: 0, likedByMe: false, commentCount: 0 },
});

function makeInput(overrides: Partial<DeleteCommentInput> = {}): DeleteCommentInput {
  return {
    commentId: COMMENT_ID,
    requesterId: AUTHOR_ID,
    ...overrides,
  };
}

// ---- repo helpers --------------------------------------------------------------

function makeCommentRepo(options: {
  found?: Comment | null;
  softDeleteResult?: Result<void, Failure>;
} = {}): {
  repo: ICommentRepository;
  softDeleteCalls: () => string[];
} {
  const found = options.found !== undefined ? options.found : makeComment();
  const softDeleteCalls: string[] = [];

  const repo: ICommentRepository = {
    create: jest.fn(),
    listByRecipe: jest.fn<Promise<Result<CommentPageResult, Failure>>, [string, number, number, string?]>(),

    async getById(): Promise<Result<Comment, Failure>> {
      if (found === null) return fail(new NotFoundFailure('errors.not_found.comment'));
      return ok(found);
    },

    async softDelete(id): Promise<Result<void, Failure>> {
      softDeleteCalls.push(id);
      return options.softDeleteResult ?? ok(undefined);
    },
  };

  return { repo, softDeleteCalls: () => softDeleteCalls };
}

function makeRecipeRepo(options: { found?: RecipeWithSocial | null } = {}): {
  repo: IRecipeRepository;
  getByIdCalls: () => string[];
} {
  const found = options.found !== undefined ? options.found : withSocial(makeRecipe());
  const getByIdCalls: string[] = [];

  const repo: IRecipeRepository = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getPreferencesForUser: jest.fn(),
    listWithoutNutrition: jest.fn(),
    incrementViewCount: jest.fn(),

    async getById(id): Promise<Result<RecipeWithSocial, Failure>> {
      getByIdCalls.push(id);
      if (found === null) return fail(new NotFoundFailure('errors.recipe.not_found'));
      return ok(found);
    },
  };

  return { repo, getByIdCalls: () => getByIdCalls };
}

// ---- tests: happy path -----------------------------------------------------------

describe('DeleteCommentUseCase — author deletes their own comment', () => {
  it('returns ok and calls softDelete with the comment id', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo);

    const result = await useCase.execute(makeInput({ requesterId: AUTHOR_ID }));

    expect(result.ok).toBe(true);
    expect(softDeleteCalls()).toEqual([COMMENT_ID]);
  });
});

describe('DeleteCommentUseCase — recipe owner deletes someone else\'s comment', () => {
  it('returns ok and calls softDelete when requester is the recipe owner but not the author', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo);

    const result = await useCase.execute(makeInput({ requesterId: OWNER_ID }));

    expect(result.ok).toBe(true);
    expect(softDeleteCalls()).toEqual([COMMENT_ID]);
  });
});

// ---- tests: ownership guard --------------------------------------------------------

describe('DeleteCommentUseCase — unauthorized requester', () => {
  it('returns ForbiddenFailure when requester is neither the author nor the recipe owner', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo);

    const result = await useCase.execute(makeInput({ requesterId: STRANGER_ID }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
    expect(softDeleteCalls()).toHaveLength(0);
  });
});

// ---- tests: not found paths --------------------------------------------------------

describe('DeleteCommentUseCase — comment not found', () => {
  it('returns NotFoundFailure and does not look up the recipe', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo({ found: null });
    const { repo: recipeRepo, getByIdCalls } = makeRecipeRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(getByIdCalls()).toHaveLength(0);
    expect(softDeleteCalls()).toHaveLength(0);
  });
});

describe('DeleteCommentUseCase — recipe not found', () => {
  it('returns NotFoundFailure and does not call softDelete', async () => {
    const { repo: commentRepo, softDeleteCalls } = makeCommentRepo();
    const { repo: recipeRepo } = makeRecipeRepo({ found: null });
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(softDeleteCalls()).toHaveLength(0);
  });
});

// ---- tests: repository failure propagation --------------------------------------

describe('DeleteCommentUseCase — softDelete failure', () => {
  it('propagates the failure when softDelete fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo: commentRepo } = makeCommentRepo({ softDeleteResult: fail(repoFailure) });
    const { repo: recipeRepo } = makeRecipeRepo();
    const useCase = new DeleteCommentUseCase(commentRepo, recipeRepo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
