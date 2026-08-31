/**
 * What one key has been doing lately.
 *
 * @remarks
 * - **Recent behaviour, not a career record.** Every number here decays, so a
 *   key that had a bad ten minutes is not punished for the rest of the day. A
 *   provider's quota is a moment; treating it as a verdict is how a pool ends
 *   the afternoon with nothing it trusts.
 * - **Latency is a moving average, not the last sample.** One slow call is
 *   noise — the provider queued behind someone else's request. A key that is
 *   consistently slower than its siblings is a different thing, and only an
 *   average can tell them apart.
 * - **Unproven is optimistic, deliberately.** A key nobody has used yet scores
 *   as if it were fast and healthy, so it gets an early turn. Pessimism about
 *   the unknown is self-fulfilling: a key ranked last is never tried, so it
 *   never earns a better rank.
 */
export interface KeyHealth {
  /**
   * Exponentially-weighted mean response time, in ms. Undefined until the key
   * has answered at least once.
   */
  readonly latencyMs?: number;
  /**
   * Failures in a row. Reset by any success, because "it is broken now" is the
   * question, and one good answer settles it.
   */
  readonly consecutiveFailures: number;
  /** When this key was last handed out — the tie-break that keeps load spread. */
  readonly lastUsedAt: number;
  /** Epoch ms before which the key must not be handed out at all. */
  readonly benchedUntil: number;
}
