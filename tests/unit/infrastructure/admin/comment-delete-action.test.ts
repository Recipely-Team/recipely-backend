import { ok, fail } from '@core/result/result';
import { ForbiddenFailure, NotFoundFailure } from '@core/failure';
import type { DeleteCommentUseCase } from '@application/comments/use-cases/delete-comment-use-case';
import { createCommentDeleteHandler } from '@infrastructure/admin/comment-delete-action';

function makeUseCase(executeAsAdmin: DeleteCommentUseCase['executeAsAdmin']): DeleteCommentUseCase {
  return { executeAsAdmin } as unknown as DeleteCommentUseCase;
}

function makeRecord() {
  return { toJSON: jest.fn().mockReturnValue({ id: 'comment-1' }) };
}

describe('createCommentDeleteHandler', () => {
  it('renders the confirm guard without deleting on a GET request', async () => {
    const execute = jest.fn();
    const handler = createCommentDeleteHandler(makeUseCase(execute));
    const record = makeRecord();

    const response = await handler(
      { method: 'get', params: { recordId: 'comment-1' } },
      undefined,
      { record, currentAdmin: { id: 'admin-1' } },
    );

    expect(execute).not.toHaveBeenCalled();
    expect(response.record).toEqual({ id: 'comment-1' });
  });

  it('routes through executeAsAdmin, the entry point that skips the ownership guard', async () => {
    const execute = jest.fn<ReturnType<DeleteCommentUseCase['executeAsAdmin']>, [string]>().mockResolvedValue(ok(undefined));
    const handler = createCommentDeleteHandler(makeUseCase(execute));
    const record = makeRecord();

    const response = await handler(
      { method: 'post', params: { recordId: 'comment-1' } },
      undefined,
      { record, currentAdmin: { id: 'admin-1' } },
    );

    expect(execute).toHaveBeenCalledWith('comment-1');
    expect(response.notice).toEqual({ message: 'successfullyDeleted', type: 'success' });
  });

  it('builds a redirect URL back to the resource list on success when h/resource are provided', async () => {
    const execute = jest.fn<ReturnType<DeleteCommentUseCase['executeAsAdmin']>, [string]>().mockResolvedValue(ok(undefined));
    const handler = createCommentDeleteHandler(makeUseCase(execute));
    const resourceUrl = jest.fn().mockReturnValue('/admin/resources/Comment');

    const response = await handler(
      { method: 'post', params: { recordId: 'comment-1' } },
      undefined,
      {
        record: makeRecord(),
        currentAdmin: { id: 'admin-1' },
        h: { resourceUrl },
        resource: { id: () => 'Comment' },
      },
    );

    expect(resourceUrl).toHaveBeenCalledWith({ resourceId: 'Comment' });
    expect(response.redirectUrl).toBe('/admin/resources/Comment');
  });

  it('surfaces a use-case failure as an error notice without redirecting', async () => {
    const failure = new ForbiddenFailure('errors.forbidden');
    const execute = jest.fn<ReturnType<DeleteCommentUseCase['executeAsAdmin']>, [string]>().mockResolvedValue(fail(failure));
    const handler = createCommentDeleteHandler(makeUseCase(execute));

    const response = await handler(
      { method: 'post', params: { recordId: 'comment-1' } },
      undefined,
      { record: makeRecord(), currentAdmin: { id: 'admin-1' } },
    );

    expect(response.redirectUrl).toBeUndefined();
    expect(response.notice).toEqual({ message: failure.messageKey, type: 'error' });
  });

  it('does not call the use case when recordId is missing', async () => {
    const execute = jest.fn();
    const handler = createCommentDeleteHandler(makeUseCase(execute));

    const response = await handler({ method: 'post', params: {} }, undefined, {
      record: makeRecord(),
      currentAdmin: { id: 'admin-1' },
    });

    expect(execute).not.toHaveBeenCalled();
    expect(response.record).toEqual({ id: 'comment-1' });
  });

  it('propagates a not-found failure from the use case as an error notice', async () => {
    const failure = new NotFoundFailure('errors.not_found.comment');
    const execute = jest.fn<ReturnType<DeleteCommentUseCase['executeAsAdmin']>, [string]>().mockResolvedValue(fail(failure));
    const handler = createCommentDeleteHandler(makeUseCase(execute));

    const response = await handler(
      { method: 'post', params: { recordId: 'missing' } },
      undefined,
      { record: makeRecord(), currentAdmin: { id: 'admin-1' } },
    );

    expect(response.notice).toEqual({ message: failure.messageKey, type: 'error' });
  });
});
