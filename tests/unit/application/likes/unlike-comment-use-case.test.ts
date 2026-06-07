import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { ICommentLikeRepository } from '@domain/likes/i-comment-like-repository';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { UnlikeCommentUseCase } from '@application/likes/use-cases/unlike-comment-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const COMMENT_ID = 'comment-uuid';

// ---- repo helpers ------------------------------------------------------------

function makeLikeRepo(options: { removeResult?: Result<void, Failure> } = {}): {
  likeRepo: ICommentLikeRepository;
  removeCalls: () => Array<{ userId: string; commentId: string }>;
} {
  const removeCalls: Array<{ userId: string; commentId: string }> = [];
  const removeResult: Result<void, Failure> = options.removeResult ?? ok(undefined);

  const likeRepo: ICommentLikeRepository = {
    add: jest.fn<Promise<Result<void, Failure>>, [string, string]>(),

    async remove(userId, commentId): Promise<Result<void, Failure>> {
      removeCalls.push({ userId, commentId });
      return removeResult;
    },
  };

  return { likeRepo, removeCalls: () => removeCalls };
}

// ---- tests ------------------------------------------------------------------

describe('UnlikeCommentUseCase — happy path', () => {
  it('returns ok when likes.remove succeeds', async () => {
    const { likeRepo } = makeLikeRepo();
    const useCase = new UnlikeCommentUseCase(likeRepo);

    const result = await useCase.execute(USER_ID, COMMENT_ID);

    expect(result.ok).toBe(true);
  });

  it('calls likes.remove once with the correct userId and commentId', async () => {
    const { likeRepo, removeCalls } = makeLikeRepo();
    const useCase = new UnlikeCommentUseCase(likeRepo);

    await useCase.execute(USER_ID, COMMENT_ID);

    expect(removeCalls()).toHaveLength(1);
    expect(removeCalls()[0]).toEqual({ userId: USER_ID, commentId: COMMENT_ID });
  });
});

describe('UnlikeCommentUseCase — likes.remove failure', () => {
  it('propagates the failure when likes.remove returns an error', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { likeRepo } = makeLikeRepo({ removeResult: fail(repoFailure) });
    const useCase = new UnlikeCommentUseCase(likeRepo);

    const result = await useCase.execute(USER_ID, COMMENT_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});

describe('UnlikeCommentUseCase — no comment existence check', () => {
  it('depends only on ICommentLikeRepository — unlike needs no comment lookup', () => {
    const { likeRepo } = makeLikeRepo();
    const useCase = new UnlikeCommentUseCase(likeRepo);

    expect(useCase).toBeDefined();
  });
});
