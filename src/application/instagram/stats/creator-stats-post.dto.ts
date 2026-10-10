import type { DmFunnelCounts } from '@domain/instagram/dm-send-repository-interface';

/** One automated post's row in the panel. */
export interface CreatorStatsPostDto extends DmFunnelCounts {
  readonly ruleId: string;
  readonly mediaId: string;
  readonly thumbnailUrl: string | null;
  readonly permalink: string | null;
  readonly keywords: readonly string[];
  readonly enabled: boolean;
}
