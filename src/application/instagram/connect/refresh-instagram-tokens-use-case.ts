import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';

const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_MS = 1000;
const REFRESH_HORIZON_DAYS = 7;
const BATCH = 50;

export interface RefreshInstagramTokensResult {
  readonly refreshed: number;
  readonly expired: number;
  readonly failed: number;
}

/**
 * **The token job** (hourly in the API process): keeps long-lived tokens alive.
 *
 * @remarks
 * - Marks every token that has already ended as expired.
 * - Refreshes active tokens with under 7 days left (never one under a day
 *   old — `InstagramConnection.needsRefresh`).
 * - A token Instagram refuses (`UnauthorizedFailure`) expires the
 *   connection; any other failure is logged and retried next hour.
 */
export class RefreshInstagramTokensUseCase {
  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly logger: LoggerInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<Result<RefreshInstagramTokensResult, Failure>> {
    if (this.graph === null) return ok({ refreshed: 0, expired: 0, failed: 0 });
    const now = this.now();
    const lapsed = await this.connections.expireLapsed(now);
    if (!lapsed.ok) return lapsed;
    const due = await this.connections.listExpiringBefore(new Date(now.getTime() + REFRESH_HORIZON_DAYS * DAY_MS), BATCH);
    if (!due.ok) return due;

    let refreshed = 0;
    let expired = lapsed.value;
    let failed = 0;
    for (const connection of due.value.filter((c) => c.needsRefresh(now))) {
      const token = await this.graph.refresh(connection.accessToken);
      const next = token.ok
        ? connection.refreshed(token.value.accessToken, new Date(now.getTime() + token.value.expiresInSeconds * SECOND_MS), now)
        : token.failure.code === 'unauthorized'
          ? connection.expired()
          : null;
      if (next === null) {
        failed += 1;
        this.logger.warn({ userId: connection.userId, messageKey: token.ok ? '' : token.failure.messageKey }, 'instagram_token_refresh_failed');
        continue;
      }
      const saved = await this.connections.save(next);
      if (!saved.ok) failed += 1;
      else if (token.ok) refreshed += 1;
      else expired += 1;
    }
    return ok({ refreshed, expired, failed });
  }
}
