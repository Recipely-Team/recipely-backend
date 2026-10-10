import type { DmFunnelCounts, DmFunnelDay } from '@domain/instagram/dm-send-repository-interface';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY_LENGTH = 10;

export const EMPTY_FUNNEL: DmFunnelCounts = { matched: 0, sent: 0, opened: 0, saved: 0 };

/** Adds funnel counts step by step. */
export const sumFunnel = (rows: readonly DmFunnelCounts[]): DmFunnelCounts =>
  rows.reduce(
    (acc, row) => ({ matched: acc.matched + row.matched, sent: acc.sent + row.sent, opened: acc.opened + row.opened, saved: acc.saved + row.saved }),
    EMPTY_FUNNEL,
  );

/** Midnight UTC of `date`'s day. */
export const startOfUtcDay = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

export const dayKey = (date: Date): string => date.toISOString().slice(0, DAY_KEY_LENGTH);

/** Every day in `[from, to)`, with the counts that day had or zeros. */
export const fillDays = (from: Date, to: Date, rows: readonly DmFunnelDay[]): DmFunnelDay[] => {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const days: DmFunnelDay[] = [];
  for (let day = from; day < to; day = addDays(day, 1)) {
    const key = dayKey(day);
    days.push(byDay.get(key) ?? { day: key, ...EMPTY_FUNNEL });
  }
  return days;
};
