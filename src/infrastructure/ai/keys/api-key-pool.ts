/** How long a key sits out after the provider says it is over its quota. */
const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * The keys held for one AI provider, and which one to use next.
 *
 * @remarks
 * - **Why more than one key at all.** These providers rate-limit per KEY, not
 *   per account. A second key is a second quota, and on the free tiers this
 *   pipeline runs on that is the difference between an import queue that drains
 *   and one that spends its afternoon retrying.
 * - **Round-robin, then cooldown.** Every call takes the next key, so load
 *   spreads instead of hammering the first one until it trips. A key that comes
 *   back rate-limited is benched for a minute rather than removed: a quota is a
 *   moment, not a verdict, and a pool that discarded keys would end an hour
 *   later with nothing left.
 * - **Empty is a legitimate state.** AI is optional here; a provider with no
 *   keys hands back `null` and the caller falls back to its disabled adapter,
 *   which is what lets a fresh environment boot without a single key set.
 * - Deliberately not shared between processes. The API and each worker hold
 *   their own pools and their own cooldowns; coordinating them would mean a
 *   shared store on the one path that must keep working when everything else
 *   is down.
 */
export class ApiKeyPool {
  private cursor = 0;
  /** key → epoch ms before which it must not be handed out again. */
  private readonly benched = new Map<string, number>();

  constructor(
    private readonly keys: readonly string[],
    private readonly cooldownMs: number = DEFAULT_COOLDOWN_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** How many keys this provider was given. Zero means "not configured". */
  get size(): number {
    return this.keys.length;
  }

  /**
   * The next key to try, or `null` when there is none to try WITH.
   *
   * Walks the whole ring once. If every key is benched it returns the one that
   * comes back soonest rather than nothing: a stale quota is a better bet than
   * refusing to make the request at all, and the provider is the authority on
   * whether the limit has actually lifted.
   */
  next(): string | null {
    if (this.keys.length === 0) return null;

    const at = this.now();
    for (let step = 0; step < this.keys.length; step += 1) {
      const key = this.keys[this.cursor % this.keys.length];
      this.cursor = (this.cursor + 1) % this.keys.length;
      if (key === undefined) continue;
      const until = this.benched.get(key);
      if (until === undefined || until <= at) return key;
    }
    return this.soonestAvailable();
  }

  /**
   * Benches a key the provider has just refused for quota reasons.
   *
   * Only call this for a rate limit. Benching on any failure would take the
   * pool apart over a bad prompt or a network blip, and leave the next import
   * with fewer keys for a reason that had nothing to do with them.
   */
  penalise(key: string): void {
    if (!this.keys.includes(key)) return;
    this.benched.set(key, this.now() + this.cooldownMs);
  }

  /** The benched key whose cooldown ends first — the least-bad option. */
  private soonestAvailable(): string | null {
    let best: string | null = null;
    let bestUntil = Number.POSITIVE_INFINITY;
    for (const key of this.keys) {
      const until = this.benched.get(key) ?? 0;
      if (until < bestUntil) {
        bestUntil = until;
        best = key;
      }
    }
    return best;
  }
}
