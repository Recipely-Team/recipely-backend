import { EmailOpsAlertNotifier } from '@infrastructure/email/email-ops-alert-notifier';

describe('EmailOpsAlertNotifier', () => {
  it('emails how many requests wait and for how long', async () => {
    const send = jest.fn().mockResolvedValue(undefined);

    await new EmailOpsAlertNotifier({ send }, 'ops@example.com', { warn: jest.fn() }).importsWaiting({ count: 3, oldestWaitMinutes: 25 });

    const message = send.mock.calls[0][0];
    expect(message.to).toBe('ops@example.com');
    expect(message.subject).toBe('Recipely: 3 import request(s) waiting 25 min');
  });

  it('logs a failed send instead of throwing into the tick', async () => {
    const warn = jest.fn();
    const send = jest.fn().mockRejectedValue(new Error('smtp down'));

    await expect(new EmailOpsAlertNotifier({ send }, 'ops@example.com', { warn }).importsWaiting({ count: 1, oldestWaitMinutes: 11 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }), 'ops_alert_send_failed');
  });
});
