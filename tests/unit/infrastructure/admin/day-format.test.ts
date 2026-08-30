/**
 * The Assistant Usage `day` column is a Postgres `date` — a bucket key with no
 * time of day. Every bug this guards against is a *silent* misread: the value
 * still renders, it just says something that isn't true.
 */

import { toIsoDay } from '@infrastructure/admin/day-format';

describe('toIsoDay', () => {
  it('drops the midnight-UTC time Prisma pads a date column with', () => {
    // The reported symptom: this rendered as "2026-08-29 03:00" in Istanbul.
    expect(toIsoDay('2026-08-29T00:00:00.000Z')).toBe('2026-08-29');
  });

  it('reads the UTC calendar day, not a viewer-local one', () => {
    // The failure mode that ruled out AdminJS's own `type: 'date'`: local-time
    // formatting moves midnight UTC to the previous day west of Greenwich,
    // filing the aggregate under a day it does not belong to.
    //
    // Asserted by naming the zone explicitly rather than by setting TZ, which
    // Node does not reliably honour once the process is running — this way the
    // test proves the divergence it claims to, on any machine.
    const midnightUtc = '2026-08-29T00:00:00.000Z';
    const inNewYork = new Date(midnightUtc).toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });

    expect(inNewYork).toBe('2026-08-28');
    expect(toIsoDay(midnightUtc)).toBe('2026-08-29');
  });

  it('formats a Date object as a date, not as its toString()', () => {
    // `String(new Date(...)).slice(0, 10)` yields "Sat Aug 29" — plausible
    // enough at a glance to survive review, and wrong.
    expect(toIsoDay(new Date('2026-08-29T00:00:00.000Z'))).toBe('2026-08-29');
  });

  it('accepts a bare date string unchanged', () => {
    expect(toIsoDay('2026-08-29')).toBe('2026-08-29');
  });

  it('returns empty for an invalid Date rather than "Invalid Da"', () => {
    expect(toIsoDay(new Date('nope'))).toBe('');
  });

  it('falls back to the raw text when nothing parses as a date', () => {
    expect(toIsoDay('not-a-date')).toBe('not-a-date');
  });
});
