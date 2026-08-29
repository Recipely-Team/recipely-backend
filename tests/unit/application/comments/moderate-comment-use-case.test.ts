import { ok, fail } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';
import type { ICommentRepository } from '@domain/comments/i-comment-repository';
import { ModerateCommentUseCase } from '@application/comments/use-cases/moderate-comment-use-case';
import type { NotificationService } from '@application/notifications/notification-service';

const COMMENT_ID = 'comment-1';
const RECIPE_ID = 'recipe-1';
const AUTHOR_ID = 'author-1';

function makeRepo(setModerationStatus: ICommentRepository['setModerationStatus']): ICommentRepository {
  return {
    create: jest.fn(),
    getById: jest.fn(),
    listByRecipe: jest.fn(),
    softDelete: jest.fn(),
    setModerationStatus,
  };
}

function makeNotificationService(): { service: NotificationService; notify: jest.Mock } {
  const notify = jest.fn();
  return { service: { notify } as unknown as NotificationService, notify };
}

describe('ModerateCommentUseCase — approve', () => {
  it('notifies the comment author', async () => {
    const setModerationStatus = jest.fn().mockResolvedValue(ok({ authorId: AUTHOR_ID, recipeId: RECIPE_ID }));
    const repo = makeRepo(setModerationStatus);
    const { service, notify } = makeNotificationService();
    const useCase = new ModerateCommentUseCase(repo, service);

    const result = await useCase.execute({ commentId: COMMENT_ID, decision: 'approved' });

    expect(result.ok).toBe(true);
    expect(setModerationStatus).toHaveBeenCalledWith(COMMENT_ID, 'approved');
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: AUTHOR_ID,
        type: 'moderation',
        recipeId: RECIPE_ID,
        commentId: COMMENT_ID,
      }),
    );
  });
});

describe('ModerateCommentUseCase — reject', () => {
  it('forwards the rejected decision to the repository', async () => {
    const setModerationStatus = jest.fn().mockResolvedValue(ok({ authorId: AUTHOR_ID, recipeId: RECIPE_ID }));
    const repo = makeRepo(setModerationStatus);
    const useCase = new ModerateCommentUseCase(repo);

    const result = await useCase.execute({ commentId: COMMENT_ID, decision: 'rejected' });

    expect(result.ok).toBe(true);
    expect(setModerationStatus).toHaveBeenCalledWith(COMMENT_ID, 'rejected');
  });
});

describe('ModerateCommentUseCase — repository failure', () => {
  it('propagates the failure and never notifies', async () => {
    const failure = new NotFoundFailure('errors.not_found.comment');
    const setModerationStatus = jest.fn().mockResolvedValue(fail(failure));
    const repo = makeRepo(setModerationStatus);
    const { service, notify } = makeNotificationService();
    const useCase = new ModerateCommentUseCase(repo, service);

    const result = await useCase.execute({ commentId: COMMENT_ID, decision: 'approved' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(failure);
    expect(notify).not.toHaveBeenCalled();
  });
});
