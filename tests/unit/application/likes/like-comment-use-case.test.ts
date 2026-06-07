import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { Comment } from '@domain/comments/comment';
import type { ICommentRepository, CommentPageResult } from '@domain/comments/i-comment-repository';
import type { ICommentLikeRepository } from '@domain/likes/i-comment-like-repository';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { LikeCommentUseCase } from '@application/likes/use-cases/like-comment-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const COMMENT_ID = 'comment-uuid';

function makeComment(): Comment {
  const result = Comment.create({
    id: COMMENT_ID,
    body: 'Looks delicious',
    moderationStatus: 'approved',
    recipeId: 'recipe-uuid',
    authorId: 'author-uuid',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  });
  if (!result.ok) throw new Error('fixture comment invalid: ' + result.failure.messageKey);
  return result.value;
}

// ---- repo helpers ------------------------------------------------------------

function makeCommentRepo(options: { found?: Comment | null } = {}): {
  repo: ICommentRepository;
  getByIdCalls: () => string[];
} {
  const found = options.found !== undefined ? options.found : makeComment();
  const getByIdCalls: string[] = [];

  const repo: ICommentRepository = {
    create: jest.fn<Promise<Result<Comment, Failure>>, [Comment]>(),
    listByRecipe: jest.fn<Promise<Result<CommentPageResult, Failure>>, [string, number, number, string?]>(),
    softDelete: jest.fn<Promise<Result<void, Failure>>, [string]>(),

    async getById(id): Promise<Result<Comment, Failure>> {
      getByIdCalls.push(id);
      if (found === null) return fail(new NotFoundFailure('errors.not_found.comment'));
      return ok(found);
    },
  };

  return { repo, getByIdCalls: () => getByIdCalls };
}

function makeLikeRepo(options: { addResult?: Result<void, Failure> } = {}): {
  likeRepo: ICommentLikeRepository;
  addCalls: () => Array<{ userId: string; commentId: string }>;
} {
  const addCalls: Array<{ userId: string; commentId: string }> = [];
  const addResult: Result<void, Failure> = options.addResult ?? ok(undefined);

  const likeRepo: ICommentLikeRepository = {
    async add(userId, commentId): Promise<Result<void, Failure>> {
      addCalls.push({ userId, commentId });
      return addResult;
    },
    remove: jest.fn<Promise<Result<void, Failure>>, [string, string]>(),
  };

  return { likeRepo, addCalls: () => addCalls };
}

// ---- tests ------------------------------------------------------------------

describe('LikeCommentUseCase — happy path', () => {
  it('returns ok when the comment exists and likes.add succeeds', async () => {
    const { repo } = makeCommentRepo();
    const { likeRepo } = makeLikeRepo();
    const useCase = new LikeCommentUseCase(likeRepo, repo);

    const result = await useCase.execute(USER_ID, COMMENT_ID);

    expect(result.ok).toBe(true);
  });

  it('verifies the comment exists via getById before liking', async () => {
    const { repo, getByIdCalls } = makeCommentRepo();
    const { likeRepo } = makeLikeRepo();
    const useCase = new LikeCommentUseCase(likeRepo, repo);

    await useCase.execute(USER_ID, COMMENT_ID);

    expect(getByIdCalls()).toEqual([COMMENT_ID]);
  });

  it('calls likes.add once with the correct userId and commentId', async () => {
    const { repo } = makeCommentRepo();
    const { likeRepo, addCalls } = makeLikeRepo();
    const useCase = new LikeCommentUseCase(likeRepo, repo);

    await useCase.execute(USER_ID, COMMENT_ID);

    expect(addCalls()).toHaveLength(1);
    expect(addCalls()[0]).toEqual({ userId: USER_ID, commentId: COMMENT_ID });
  });
});

describe('LikeCommentUseCase — comment not found', () => {
  it('returns NotFoundFailure when the comment does not exist', async () => {
    const { repo } = makeCommentRepo({ found: null });
    const { likeRepo } = makeLikeRepo();
    const useCase = new LikeCommentUseCase(likeRepo, repo);

    const result = await useCase.execute(USER_ID, COMMENT_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });

  it('does not call likes.add when the comment is not found', async () => {
    const { repo } = makeCommentRepo({ found: null });
    const { likeRepo, addCalls } = makeLikeRepo();
    const useCase = new LikeCommentUseCase(likeRepo, repo);

    await useCase.execute(USER_ID, COMMENT_ID);

    expect(addCalls()).toHaveLength(0);
  });
});

describe('LikeCommentUseCase — likes.add failure', () => {
  it('propagates the failure when likes.add returns an error', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeCommentRepo();
    const { likeRepo } = makeLikeRepo({ addResult: fail(repoFailure) });
    const useCase = new LikeCommentUseCase(likeRepo, repo);

    const result = await useCase.execute(USER_ID, COMMENT_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
