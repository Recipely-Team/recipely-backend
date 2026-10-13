import type { EmailSenderInterface } from '@application/auth/ports/email-sender-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type {
  CreatorApplication,
  CreatorApplicationNotifierInterface,
} from '@application/users/ports/creator-application-notifier-interface';

/** Where the creator tag queue is reviewed. */
const ADMIN_PANEL_URL = 'https://admin.recipely.net';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Emails the team (`CREATOR_APPLICATION_NOTIFY_EMAIL`) when a creator applies
 * for a creator tag: platform, handle, user id and a link to the admin panel.
 * A send that fails is logged and dropped — the applicant's request has already
 * been saved and must not fail because a notification did.
 */
export class EmailCreatorApplicationNotifier implements CreatorApplicationNotifierInterface {
  constructor(
    private readonly email: EmailSenderInterface,
    private readonly to: string,
    private readonly logger: LoggerInterface,
  ) {}

  async applied(application: CreatorApplication): Promise<void> {
    const { platform, handle, userId } = application;
    const subject = `New creator application: @${handle} (${platform})`;
    const lines = [`Platform: ${platform}`, `Handle: @${handle}`, `User id: ${userId}`, `Review: ${ADMIN_PANEL_URL}`];
    try {
      await this.email.send({
        to: this.to,
        subject,
        text: `A creator applied for a creator tag on Recipely.\n\n${lines.join('\n')}\n`,
        html: `<p>A creator applied for a creator tag on Recipely.</p><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
      });
    } catch (err) {
      this.logger.warn({ userId, platform, err: (err as Error).message }, 'creator_application_notify_failed');
    }
  }
}
