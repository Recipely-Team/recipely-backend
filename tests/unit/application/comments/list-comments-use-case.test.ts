import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Comment } from '@domain/comments/comment';
import type {
  ICommentRepository,
  CommentPageResult,
  CommentWithAuthor,
} from '@domain/comments/i-comment-repository';
import { ListCommentsUseCase, type ListCommentsInput } from '@application/comments/use-cases/list-comments-use-case';

// ---- fixtures ----------------------------------------------------------------

const RECIPE_ID = 'recipe-uuid';
const USER_ID = 'user-uuid';

function makeComment(id: string, rating?: number): Comment {
  const result = Comment.create({
    id,
    body: `Comment ${id}`,
    ...(rating !== undefined ? { rating } : {}),
    moderationStatus: 'approved',
    recipeId: RECIPE_ID,
    authorId: 'author-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  });
  if (!result.ok) throw new Error('fixture comment invalid: ' + result.failure.messageKey);
  return result.value;
}

function makeItem(id: string, overrides: Partial<CommentWithAuthor> = {}): CommentWithAuthor {
  return {
    comment: makeComment(id),
    authorDisplayName: 'Ada Lovelace',
    authorPhotoUrl: null,
    likeCount: 0,
    likedByMe: false,
    ...overrides,
  };
}

function makePage(items: CommentWithAuthor[], total = items.length): CommentPageResult {
  return { items, total, page: 1, pageSize: 20 };
}

// ---- mocks ------------------------------------------------------------------

interface RepoOptions {
  listResult?: Result<CommentPageResult, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: ICommentRepository;
  listCalls: () => Array<{ recipeId: string; page: number; pageSize: number; currentUserId?: string }>;
} {
  const listCalls: Array<{ recipeId: string; page: number; pageSize: number; currentUserId?: string }> = [];

  const repo: ICommentRepository = {
    create: jest.fn(),
    getById: jest.fn(),
    softDelete: jest.fn(),

    async listByRecipe(recipeId, page, pageSize, currentUserId): Promise<Result<CommentPageResult, Failure>> {
      listCalls.push({ recipeId, page, pageSize, ...(currentUserId !== undefined ? { currentUserId } : {}) });
      return options.listResult ?? ok(makePage([makeItem('c1')]));
    },
  };

  return { repo, listCalls: () => listCalls };
}

function makeInput(overrides: Partial<ListCommentsInput> = {}): ListCommentsInput {
  return {
    recipeId: RECIPE_ID,
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

// ---- tests ------------------------------------------------------------------

describe('ListCommentsUseCase — happy path', () => {
  it('maps repository items to comment DTOs', async () => {
    const item = makeItem('c1', {
      comment: makeComment('c1', 5),
      authorDisplayName: 'Grace Hopper',
      authorPhotoUrl: 'https://example.com/grace.jpg',
      likeCount: 3,
      likedByMe: true,
    });
    const { repo } = makeRepo({ listResult: ok(makePage([item])) });
    const useCase = new ListCommentsUseCase(repo);

    const result = await useCase.execute(makeInput({ currentUserId: USER_ID }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual([
      {
        id: 'c1',
        body: 'Comment c1',
        rating: 5,
        moderationStatus: 'approved',
        recipeId: RECIPE_ID,
        authorId: 'author-1',
        authorDisplayName: 'Grace Hopper',
        authorPhotoUrl: 'https://example.com/grace.jpg',
        likeCount: 3,
        likedByMe: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('defaults rating to null in the DTO when the comment has none', async () => {
    const { repo } = makeRepo({ listResult: ok(makePage([makeItem('c1')])) });
    const useCase = new ListCommentsUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]!.rating).toBeNull();
  });

  it('preserves pagination metadata from the repository', async () => {
    const { repo } = makeRepo({
      listResult: ok({ items: [makeItem('c1'), makeItem('c2')], total: 42, page: 3, pageSize: 2 }),
    });
    const useCase = new ListCommentsUseCase(repo);

    const result = await useCase.execute(makeInput({ page: 3, pageSize: 2 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe(42);
    expect(result.value.page).toBe(3);
    expect(result.value.pageSize).toBe(2);
    expect(result.value.items).toHaveLength(2);
  });

  it('returns an empty items array when the recipe has no comments', async () => {
    const { repo } = makeRepo({ listResult: ok(makePage([])) });
    const useCase = new ListCommentsUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual([]);
    expect(result.value.total).toBe(0);
  });
});

describe('ListCommentsUseCase — argument forwarding', () => {
  it('forwards recipeId, page, pageSize, and currentUserId to the repository', async () => {
    const { repo, listCalls } = makeRepo();
    const useCase = new ListCommentsUseCase(repo);

    await useCase.execute(makeInput({ page: 2, pageSize: 10, currentUserId: USER_ID }));

    expect(listCalls()).toEqual([
      { recipeId: RECIPE_ID, page: 2, pageSize: 10, currentUserId: USER_ID },
    ]);
  });

  it('omits currentUserId for anonymous listings', async () => {
    const { repo, listCalls } = makeRepo();
    const useCase = new ListCommentsUseCase(repo);

    await useCase.execute(makeInput());

    expect(listCalls()).toEqual([{ recipeId: RECIPE_ID, page: 1, pageSize: 20 }]);
  });
});

describe('ListCommentsUseCase — repository failure', () => {
  it('propagates the failure when listByRecipe fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo } = makeRepo({ listResult: fail(repoFailure) });
    const useCase = new ListCommentsUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
