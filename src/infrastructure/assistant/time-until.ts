/**
 * Whole milliseconds left before `deadline`: never negative, never fractional,
 * never NaN.
 *
 * Both assistant providers turn the request's deadline into their own abort
 * timer; one definition keeps them from disagreeing about what "left" means.
 * `AbortSignal.timeout` throws on a fraction or NaN, and inside Gemini's `try`
 * that throw would read as an outage on every call — so a value that is not a
 * finite number counts as no time left, loudly failing the turn instead.
 */
export function timeUntil(deadline: number, now: number = Date.now()): number {
  const left = Math.ceil(deadline - now);
  return Number.isFinite(left) && left > 0 ? left : 0;
}
