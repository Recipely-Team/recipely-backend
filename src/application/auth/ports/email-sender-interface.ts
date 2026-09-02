export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface EmailSenderInterface {
  send(message: EmailMessage): Promise<void>;
}
