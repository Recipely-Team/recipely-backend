import type { IEmailSender, EmailMessage } from '@application/auth/ports/i-email-sender';

export class NoopEmailSender implements IEmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[NoopEmailSender] Would send to ${message.to}: ${message.subject}`);
  }
}
