import { ok, fail } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';
import { createModerationActionHandler } from '@infrastructure/admin/moderation-action';

function makeRecord() {
  return { toJSON: jest.fn().mockReturnValue({ id: 'recipe-1' }) };
}

describe('createModerationActionHandler', () => {
  it('renders the record without running the decision on a GET request', async () => {
    const run = jest.fn();
    const handler = createModerationActionHandler(run, 'Approved');
    const record = makeRecord();

    const response = await handler(
      { method: 'get', params: { recordId: 'recipe-1' } },
      undefined,
      { record, currentAdmin: { id: 'admin-1' } },
    );

    expect(run).not.toHaveBeenCalled();
    expect(response.record).toEqual({ id: 'recipe-1' });
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
