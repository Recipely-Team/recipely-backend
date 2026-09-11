/**
 * Milliseconds left before `deadline`, never negative.
 *
 * Both assistant providers turn the request's deadline into their own abort
 * timer; one definition keeps them from disagreeing about what "left" means.
 */
export function timeUntil(deadline: number, now: number = Date.now()): number {
  return Math.max(0, deadline - now);
}
