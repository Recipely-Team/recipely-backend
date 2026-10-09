/** The ranges the creator stats panel offers, in days. */
export const StatsRange = {
  Week: 7,
  Month: 30,
  Quarter: 90,
} as const;
export type StatsRangeType = (typeof StatsRange)[keyof typeof StatsRange];
export const isStatsRange = (v: unknown): v is StatsRangeType => (Object.values(StatsRange) as unknown[]).includes(v);
