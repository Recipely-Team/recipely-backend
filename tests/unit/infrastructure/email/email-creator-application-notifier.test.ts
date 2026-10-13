import { EmailCreatorApplicationNotifier } from '@infrastructure/email/email-creator-application-notifier';
import { CreatorPlatform } from '@domain/users/creator-platform';

const APPLICATION = { userId: 'u-1', platform: CreatorPlatform.Instagram, handle: 'ada.cooks' };

describe('EmailCreatorApplicationNotifier', () => {
  it('emails the configured address with the platform, handle and the admin panel', async () => {
    const send = jest.fn().mockResolvedValue(undefined);

    await new EmailCreatorApplicationNotifier({ send }, 'team@example.com', { warn: jest.fn() }).applied(APPLICATION);

    const message = send.mock.calls[0][0];
    expect(message.to).toBe('team@example.com');
    expect(message.subject).toContain('@ada.cooks');
    expect(message.text).toContain('admin.recipely.net');
  });

  it('logs a failed send instead of failing the application', async () => {
    const warn = jest.fn();
    const send = jest.fn().mockRejectedValue(new Error('smtp down'));

    await expect(new EmailCreatorApplicationNotifier({ send }, 'team@example.com', { warn }).applied(APPLICATION)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1' }), 'creator_application_notify_failed');
  });
});
