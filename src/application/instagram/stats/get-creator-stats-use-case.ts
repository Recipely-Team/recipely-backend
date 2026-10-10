import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type { DmSendRepositoryInterface } from '@domain/instagram/dm-send-repository-interface';
import type { FollowerSnapshotRepositoryInterface } from '@domain/instagram/follower-snapshot-repository-interface';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { CreatorStatsDto } from '@application/instagram/stats/creator-stats.dto';
import type { CreatorStatsPostDto } from '@application/instagram/stats/creator-stats-post.dto';
import type { StatsRangeType } from '@application/instagram/stats/stats-range';
import { EMPTY_FUNNEL, addDays, dayKey, fillDays, startOfUtcDay, sumFunnel } from '@application/instagram/stats/funnel-math';

/** The rules list's own cap; a creator automates far fewer posts than this. */
const RULES_MAX = 100;

export interface GetCreatorStatsInput {
  readonly userId: string;
  readonly days: StatsRangeType;
}

/**
 * **`GET /me/instagram/stats`** — the creator stats panel (see `CreatorStatsDto`).
 *
 * @remarks
 * - The previous period is the same number of days just before `from`, for the deltas.
 * - Posts are the creator's rules, every one listed even with no attempts,
 *   ordered by opens, then sends.
 */
export class GetCreatorStatsUseCase {
  constructor(
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly rules: DmRuleRepositoryInterface,
    private readonly sends: DmSendRepositoryInterface,
    private readonly snapshots: FollowerSnapshotRepositoryInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: GetCreatorStatsInput): Promise<Result<CreatorStatsDto, Failure>> {
    const to = addDays(startOfUtcDay(this.now()), 1);
    const from = addDays(to, -input.days);
    const connection = await this.connections.findByUserId(input.userId);
    if (!connection.ok) return connection;
    const current = await this.sends.funnelByDay(input.userId, from, to);
    if (!current.ok) return current;
    const previous = await this.sends.funnelByDay(input.userId, addDays(from, -input.days), from);
    if (!previous.ok) return previous;
    const posts = await this.posts(input.userId, from, to);
    if (!posts.ok) return posts;
    const points = await this.snapshots.listSince(input.userId, dayKey(from));
    if (!points.ok) return points;
    const first = await this.snapshots.firstDay(input.userId);
    if (!first.ok) return first;

    const firstPoint = points.value[0];
    const lastPoint = points.value[points.value.length - 1];
    return ok({
      days: input.days,
      from: dayKey(from),
      to: dayKey(to),
      connected: connection.value !== null,
      totals: sumFunnel(current.value),
      previous: sumFunnel(previous.value),
      daily: fillDays(from, to, current.value),
      followers: {
        current: lastPoint?.followers ?? null,
        change: firstPoint !== undefined && lastPoint !== undefined && points.value.length > 1 ? lastPoint.followers - firstPoint.followers : null,
        trackingSince: first.value,
        points: points.value,
      },
      posts: posts.value,
    });
  }

  private async posts(userId: string, from: Date, to: Date): Promise<Result<CreatorStatsPostDto[], Failure>> {
    const rules = await this.rules.listByUser(userId, 1, RULES_MAX);
    if (!rules.ok) return rules;
    const counts = await this.sends.funnelByRule(userId, from, to);
    if (!counts.ok) return counts;
    const byRule = new Map(counts.value.map((row) => [row.ruleId, row]));
    const posts = rules.value.items.map(({ rule }): CreatorStatsPostDto => {
      const { matched, sent, opened, saved } = byRule.get(rule.id) ?? EMPTY_FUNNEL;
      return {
        ruleId: rule.id,
        mediaId: rule.mediaId,
        thumbnailUrl: rule.media.thumbnailUrl,
        permalink: rule.media.permalink,
        keywords: rule.keywords,
        enabled: rule.enabled,
        matched,
        sent,
        opened,
        saved,
      };
    });
    return ok(posts.sort((a, b) => b.opened - a.opened || b.sent - a.sent));
  }
}
