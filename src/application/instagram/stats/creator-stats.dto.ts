import type { DmFunnelCounts, DmFunnelDay } from '@domain/instagram/dm-send-repository-interface';
import type { CreatorStatsPostDto } from '@application/instagram/stats/creator-stats-post.dto';
import type { FollowerPoint } from '@domain/instagram/follower-snapshot-repository-interface';

/**
 * **`GET /me/instagram/stats?days=7|30|90`** — the creator stats panel.
 *
 * @remarks
 * - Days are UTC; `from` is inclusive, `to` exclusive (`to` is tomorrow, so today counts).
 * - Every count is of attempts made in the range, followed through: an open
 *   or save that happened later still counts for the day the DM went out.
 * - `daily` holds every day of the range, zeros included.
 * - `followers.trackingSince` is the first snapshot ever; when it falls inside
 *   the range the trend starts there. `change` needs two points in the range.
 */
export interface CreatorStatsDto {
  readonly days: number;
  readonly from: string;
  readonly to: string;
  readonly connected: boolean;
  readonly totals: DmFunnelCounts;
  readonly previous: DmFunnelCounts;
  readonly daily: readonly DmFunnelDay[];
  readonly followers: {
    readonly current: number | null;
    readonly change: number | null;
    readonly trackingSince: string | null;
    readonly points: readonly FollowerPoint[];
  };
  readonly posts: readonly CreatorStatsPostDto[];
}
