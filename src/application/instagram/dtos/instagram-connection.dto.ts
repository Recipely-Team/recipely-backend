import type { InstagramConnectionStatusType } from '@domain/instagram/instagram-connection-status';

/** `GET /me/instagram` — the linked account, or `connected: false` with every other field null. */
export interface InstagramConnectionDto {
  readonly connected: boolean;
  /** Whether this server has Instagram set up at all; when false, hide the feature. */
  readonly available: boolean;
  readonly username: string | null;
  readonly igUserId: string | null;
  /** `expired` asks the owner to reconnect. */
  readonly status: InstagramConnectionStatusType | null;
  readonly tokenExpiresAt: string | null;
  readonly connectedAt: string | null;
}
