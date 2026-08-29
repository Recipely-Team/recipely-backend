import type { IEmailSender, EmailMessage } from '@application/auth/ports/i-email-sender';
import type { ILogger } from '@application/ports/i-logger';

export class NoopEmailSender implements IEmailSender {
  constructor(private readonly logger: ILogger) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn({ to: message.to, subject: message.subject }, 'noop_email_sender_send');
  }
}
