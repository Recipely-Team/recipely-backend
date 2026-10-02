import { Entity } from '@core/entity/entity';
import { InstagramConnectionStatus, type InstagramConnectionStatusType } from '@domain/instagram/instagram-connection-status';

export interface InstagramConnectionProps {
  readonly id: string;
  readonly userId: string;
  /** The professional account id webhooks name and private replies are sent as. */
  readonly igUserId: string;
  /** The app-scoped id `/me` answers; Meta's deletion callbacks may use it instead. */
  readonly appScopedId: string | null;
  readonly username: string;
  /** Plain here; the repository encrypts it at rest. */
  readonly accessToken: string;
  readonly tokenExpiresAt: Date;
  readonly status: InstagramConnectionStatusType;
  readonly connectedAt: Date;
  readonly refreshedAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Refresh once a token has this little life left. */
const REFRESH_WITHIN_DAYS = 7;
/** Instagram refuses to refresh a token younger than a day. */
const MIN_AGE_BEFORE_REFRESH_DAYS = 1;

/**
 * **A creator's linked Instagram professional account**, and its long-lived token.
 *
 * @remarks
 * - Usable while `Active` and unexpired; `Expired` (lapsed, or refused by
 *   Instagram) waits for the owner to reconnect.
 * - The token job refreshes one that has under 7 days left, but never one
 *   under a day old — Instagram answers that with an error.
 */
export class InstagramConnection extends Entity<InstagramConnectionProps> {
  private constructor(props: InstagramConnectionProps) {
    super(props);
  }

  static restore(props: InstagramConnectionProps): InstagramConnection {
    return new InstagramConnection(props);
  }

  isUsable(now: Date): boolean {
    return this.props.status === InstagramConnectionStatus.Active && this.props.tokenExpiresAt > now;
  }

  needsRefresh(now: Date): boolean {
    return (
      this.isUsable(now) &&
      this.props.tokenExpiresAt.getTime() - now.getTime() < REFRESH_WITHIN_DAYS * DAY_MS &&
      now.getTime() - this.props.refreshedAt.getTime() >= MIN_AGE_BEFORE_REFRESH_DAYS * DAY_MS
    );
  }

  refreshed(accessToken: string, tokenExpiresAt: Date, now: Date): InstagramConnection {
    return new InstagramConnection({ ...this.props, accessToken, tokenExpiresAt, refreshedAt: now, status: InstagramConnectionStatus.Active });
  }

  expired(): InstagramConnection {
    return new InstagramConnection({ ...this.props, status: InstagramConnectionStatus.Expired });
  }

  get userId(): string { return this.props.userId; }
  get igUserId(): string { return this.props.igUserId; }
  get appScopedId(): string | null { return this.props.appScopedId; }
  get username(): string { return this.props.username; }
  get accessToken(): string { return this.props.accessToken; }
  get tokenExpiresAt(): Date { return this.props.tokenExpiresAt; }
  get status(): InstagramConnectionStatusType { return this.props.status; }
  get connectedAt(): Date { return this.props.connectedAt; }
  get refreshedAt(): Date { return this.props.refreshedAt; }
}
