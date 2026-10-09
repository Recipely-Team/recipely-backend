import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FollowerSnapshotRepositoryInterface } from '@domain/instagram/follower-snapshot-repository-interface';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import { dayKey } from '@application/instagram/stats/funnel-math';

/** Accounts per hourly tick — one Graph call each, well inside Instagram's per-user budget. */
const BATCH = 100;

export interface SnapshotFollowersResult {
  readonly recorded: number;
  readonly failed: number;
}

/**
 * **The follower snapshot job** (hourly in the API process): writes today's
 * follower count for every active connection that has no row for today yet.
 *
 * @remarks
 * - Instagram answers only the current count; this table is the history.
 * - A failed account is logged and simply tried again next hour — the row for
 *   today is still missing, so it is still listed.
 * - Idles when Instagram is not configured.
 */
export class SnapshotInstagramFollowersUseCase {
  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly snapshots: FollowerSnapshotRepositoryInterface,
    private readonly logger: LoggerInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<Result<SnapshotFollowersResult, Failure>> {
    if (this.graph === null) return ok({ recorded: 0, failed: 0 });
    const now = this.now();
    const day = dayKey(now);
    const missing = await this.snapshots.listMissing(day, BATCH);
    if (!missing.ok) return missing;

    let recorded = 0;
    let failed = 0;
    for (const userId of missing.value) {
      const connection = await this.connections.findByUserId(userId);
      if (!connection.ok || connection.value === null || !connection.value.isUsable(now)) {
        failed += 1;
        continue;
      }
      const profile = await this.graph.profile(connection.value.accessToken);
      const saved = profile.ok ? await this.snapshots.record(userId, day, profile.value.followersCount, profile.value.mediaCount) : profile;
      if (saved.ok) {
        recorded += 1;
        continue;
      }
      failed += 1;
      this.logger.warn({ userId, messageKey: saved.failure.messageKey }, 'instagram_follower_snapshot_failed');
    }
    return ok({ recorded, failed });
  }
}
