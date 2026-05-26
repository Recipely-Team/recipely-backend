export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface IEmailSender {
  send(message: EmailMessage): Promise<void>;
}
