import { timeUntil } from '@infrastructure/assistant/time-until';

/**
 * `AbortSignal.timeout` throws on a fraction or NaN, and inside the Gemini seat's
 * `try` that throw reads as an outage on every call. So what this hands the abort
 * timer must always be a whole, finite, non-negative number of milliseconds.
 */
describe('timeUntil', () => {
  it('rounds a fraction up to a whole millisecond', () => {
    expect(timeUntil(1_000.2, 0)).toBe(1_001);
  });

  it('treats a deadline already passed as no time left', () => {
    expect(timeUntil(1_000, 2_000)).toBe(0);
  });

  it('treats a deadline that is not a number as no time left', () => {
    expect(timeUntil(Number.NaN, 0)).toBe(0);
  });
});
