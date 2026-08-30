import { ok, fail } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';
import { createSuspendUserActionHandler } from '@infrastructure/admin/suspend-user-action';

function makeRecord() {
  return { toJSON: jest.fn().mockReturnValue({ id: 'user-1' }) };
}

describe('createSuspendUserActionHandler', () => {
  it('renders the record without running the decision on a GET request', async () => {
    const run = jest.fn();
    const handler = createSuspendUserActionHandler(run, 'User suspended');
    const record = makeRecord();

    const response = await handler(
      { method: 'get', params: { recordId: 'user-1' } },
      undefined,
      { record, currentAdmin: { id: 'admin-1' } },
    );

    expect(run).not.toHaveBeenCalled();
    expect(response.record).toEqual({ id: 'user-1' });
  });

  it('trims the payload reason and forwards it on POST', async () => {
    const run = jest.fn().mockResolvedValue(ok(undefined));
    const handler = createSuspendUserActionHandler(run, 'User suspended');
    const record = makeRecord();

    const response = await handler(
      { method: 'post', params: { recordId: 'user-1' }, payload: { reason: '  spamming comments  ' } },
      undefined,
      { record, currentAdmin: { id: 'admin-1' } },
    );

    // The signed-in admin is forwarded so the suspension can be attributed.
    expect(run).toHaveBeenCalledWith('user-1', 'spamming comments', 'admin-1');
    expect(response.notice).toEqual({ message: 'User suspended', type: 'success' });
  });

  it('forwards undefined when the reason is blank or missing', async () => {
    const run = jest.fn().mockResolvedValue(ok(undefined));
    const handler = createSuspendUserActionHandler(run, 'User suspended');

    await handler(
      { method: 'post', params: { recordId: 'user-1' }, payload: { reason: '   ' } },
      undefined,
      { record: makeRecord(), currentAdmin: { id: 'admin-1' } },
    );

    expect(run).toHaveBeenCalledWith('user-1', undefined, 'admin-1');
  });

  it('surfaces a use-case failure as an error notice', async () => {
    const failure = new NotFoundFailure('errors.not_found.user');
    const run = jest.fn().mockResolvedValue(fail(failure));
    const handler = createSuspendUserActionHandler(run, 'User suspended');

    const response = await handler(
      { method: 'post', params: { recordId: 'user-1' }, payload: { reason: 'x' } },
      undefined,
      { record: makeRecord(), currentAdmin: { id: 'admin-1' } },
    );

    expect(response.notice).toEqual({ message: failure.messageKey, type: 'error' });
  });

  it('does not run the decision when recordId is missing', async () => {
    const run = jest.fn();
    const handler = createSuspendUserActionHandler(run, 'User suspended');

    const response = await handler({ method: 'post', params: {} }, undefined, {
      record: makeRecord(),
      currentAdmin: { id: 'admin-1' },
    });

    expect(run).not.toHaveBeenCalled();
    expect(response.record).toEqual({ id: 'user-1' });
  });
});
