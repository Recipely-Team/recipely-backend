import type { EmailSenderInterface, EmailMessage } from '@application/auth/ports/email-sender-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';

export class NoopEmailSender implements EmailSenderInterface {
  constructor(private readonly logger: LoggerInterface) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn({ to: message.to, subject: message.subject }, 'noop_email_sender_send');
  }
}
