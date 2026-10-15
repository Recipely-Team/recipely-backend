import { ok, fail } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';
import { createModerationActionHandler } from '@infrastructure/admin/moderation-action';

function makeRecord() {
  return { toJSON: jest.fn().mockReturnValue({ id: 'recipe-1' }) };
}

describe('createModerationActionHandler', () => {
  // AdminJS sends a component-less action button as a GET; approving a creator
  // tag in the panel did nothing because only a POST ran the decision.
  it('runs the decision when the admin button arrives as a GET request', async () => {
    const run = jest.fn().mockResolvedValue(ok(undefined));
    const handler = createModerationActionHandler(run, 'Creator tag approved');
    const record = makeRecord();

    const response = await handler(
      { method: 'get', params: { recordId: 'recipe-1' } },
      undefined,
      { record, currentAdmin: { id: 'admin-1' } },
    );

    expect(run).toHaveBeenCalledWith('recipe-1', 'admin-1');
    expect(response.notice).toEqual({ message: 'Creator tag approved', type: 'success' });
  });

  it('runs the decision on POST and returns the given success notice', async () => {
    const run = jest.fn().mockResolvedValue(ok(undefined));
    const handler = createModerationActionHandler(run, 'Recipe approved');
    const record = makeRecord();

    const response = await handler(
      { method: 'post', params: { recordId: 'recipe-1' } },
      undefined,
      { record, currentAdmin: { id: 'admin-1' } },
    );

    // The signed-in admin is forwarded; approve/reject ignore it, unsuspend
    // records it (see prisma-auth-repository-suspension.test.ts).
    expect(run).toHaveBeenCalledWith('recipe-1', 'admin-1');
    expect(response.notice).toEqual({ message: 'Recipe approved', type: 'success' });
  });

  // Approving left the Approve/Reject buttons on screen until a reload: the
  // response carried the record as it was before the decision.
  it('returns the record re-read after the decision, so the page drops stale buttons', async () => {
    const run = jest.fn().mockResolvedValue(ok(undefined));
    const handler = createModerationActionHandler(run, 'Creator tag approved');
    const fresh = { toJSON: jest.fn().mockReturnValue({ id: 'tag-1', status: 'approved' }) };
    const findOne = jest.fn().mockResolvedValue(fresh);

    const response = await handler({ method: 'get', params: { recordId: 'tag-1' } }, undefined, {
      record: makeRecord(),
      currentAdmin: { id: 'admin-1' },
      resource: { findOne },
    });

    expect(findOne).toHaveBeenCalledWith('tag-1');
    expect(response.record).toEqual({ id: 'tag-1', status: 'approved' });
  });

  it('surfaces a use-case failure as an error notice', async () => {
    const failure = new NotFoundFailure('errors.not_found.recipe');
    const run = jest.fn().mockResolvedValue(fail(failure));
    const handler = createModerationActionHandler(run, 'Recipe approved');

    const response = await handler(
      { method: 'post', params: { recordId: 'recipe-1' } },
      undefined,
      { record: makeRecord(), currentAdmin: { id: 'admin-1' } },
    );

    expect(response.notice).toEqual({ message: failure.messageKey, type: 'error' });
  });

  it('does not run the decision when recordId is missing', async () => {
    const run = jest.fn();
    const handler = createModerationActionHandler(run, 'Recipe approved');

    const response = await handler({ method: 'post', params: {} }, undefined, {
      record: makeRecord(),
      currentAdmin: { id: 'admin-1' },
    });

    expect(run).not.toHaveBeenCalled();
    expect(response.record).toEqual({ id: 'recipe-1' });
  });
});
