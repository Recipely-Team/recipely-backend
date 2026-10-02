/** Mints the one-time code a pending Instagram link is claimed with, and hashes codes for storage. */
export interface OneTimeCodeInterface {
  /** A fresh, unguessable code (sent to the app once, never stored). */
  mint(): string;
  /** What is stored and looked up instead of the code itself. */
  hash(code: string): string;
}
