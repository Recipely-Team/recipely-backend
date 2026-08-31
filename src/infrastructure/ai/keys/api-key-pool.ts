import type { KeyHealth } from '@infrastructure/ai/keys/key-health';

/** How long a key sits out after the provider says it is over its quota. */
const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * How much of the new sample a latency average takes.
 *
 * 0.3 means roughly the last handful of calls decide the number: fast enough to
 * notice a key that has gone slow, slow enough that one queued request does not
 * relegate it.
 */
const LATENCY_SMOOTHING = 0.3;

/**
 * What an unproven key is assumed to cost.
 *
 * Optimistic on purpose — see {@link KeyHealth}. A key ranked last is never
 * tried, so it never earns a better rank; the pool has to be willing to spend
 * one request finding out.
 */
const UNPROVEN_LATENCY_MS = 0;

/**
 * How many consecutive failures make a key genuinely worse than its siblings.
 *
 * Below this, a key is merely unlucky and stays in the ordinary ordering. At or
 * above it, the key sorts behind every healthier one — the "least efficient
 * last" the pool exists to provide.
 */
const UNHEALTHY_AFTER_FAILURES = 2;

/**
 * The keys held for one AI provider, and which one to use next.
 *
 * @remarks
 * - **Why more than one key at all.** These providers rate-limit per KEY, not
 *   per account. A second key is a second quota, and on the free tiers this
 *   pipeline runs on that is the difference between an import queue that drains
 *   and one that spends its afternoon retrying.
 * - **Ranked by behaviour, then cooldown.** Keys are ordered by how they have
 *   been performing — healthy before failing, faster before slower, and
 *   least-recently-used to break a tie. A key that comes back rate-limited is
 *   benched for a minute rather than removed: a quota is a moment, not a
 *   verdict, and a pool that discarded keys would end an hour later with
 *   nothing left.
 * - **Ranking picks the ORDER, not one winner.** "Always use the best key" is
 *   the single-key setup that already failed here: these providers rate-limit
 *   per KEY, so funnelling everything into the fastest one walks it into its
 *   own quota and turns a pool back into one key. The least-recently-used
 *   tie-break is what keeps equally healthy keys taking turns.
 * - **Empty is a legitimate state.** AI is optional here; a provider with no
 *   keys hands back `null` and the caller falls back to its disabled adapter,
 *   which is what lets a fresh environment boot without a single key set.
 * - Deliberately not shared between processes. The API and each worker hold
 *   their own pools and their own cooldowns; coordinating them would mean a
 *   shared store on the one path that must keep working when everything else
 *   is down.
 */
export class ApiKeyPool {
  /** key → what it has been doing lately. Absent until a key is first used. */
  private readonly health = new Map<string, KeyHealth>();

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
   * The keys themselves, for a caller that assigns rather than rotates.
   * {@link TieredKeyPool} needs a stable index per user, which the health
   * ordering deliberately does not provide.
   */
  get all(): readonly string[] {
    return this.keys;
  }

  /**
   * The best key to try right now, or `null` when there is none to try WITH.
   *
   * @remarks
   * - **Ordered by how each key has been behaving**, worst last. A key that has
   *   failed twice in a row sorts behind every healthier one; among healthy
   *   keys the faster average wins; ties go to whichever was used longest ago.
   * - **The tie-break is what keeps load spread.** "Always use the best key" is
   *   the single-key setup we already know fails: these providers rate-limit
   *   per KEY, so funnelling every request into the fastest one walks it into
   *   its own quota and turns 48 keys back into one. Ranking decides the ORDER
   *   of candidates; the least-recently-used tie-break keeps healthy keys
   *   taking turns.
   * - **Benched keys are excluded outright**, and if every key is benched the
   *   one whose cooldown ends soonest is handed back anyway: a stale quota is a
   *   better bet than refusing to make the request, and the provider is the
   *   authority on whether the limit has really lifted.
   */
  next(): string | null {
    if (this.keys.length === 0) return null;

    const at = this.now();
    const ready = this.keys.filter((key) => (this.health.get(key)?.benchedUntil ?? 0) <= at);
    const candidates = ready.length > 0 ? ready : this.keys;

    let best: string | null = null;
    for (const key of candidates) {
      if (best === null || this.prefer(key, best, ready.length === 0)) best = key;
    }
    if (best === null) return null;

    this.health.set(best, { ...this.healthOf(best), lastUsedAt: at });
    return best;
  }

  /** Whether `key` should be tried before `other`. */
  private prefer(key: string, other: string, allBenched: boolean): boolean {
    const a = this.healthOf(key);
    const b = this.healthOf(other);

    // Nothing is ready: the only question is whose cooldown ends first.
    if (allBenched) return a.benchedUntil < b.benchedUntil;

    const aSick = a.consecutiveFailures >= UNHEALTHY_AFTER_FAILURES;
    const bSick = b.consecutiveFailures >= UNHEALTHY_AFTER_FAILURES;
    if (aSick !== bSick) return !aSick;
    if (aSick && bSick && a.consecutiveFailures !== b.consecutiveFailures) {
      return a.consecutiveFailures < b.consecutiveFailures;
    }

    const aLatency = a.latencyMs ?? UNPROVEN_LATENCY_MS;
    const bLatency = b.latencyMs ?? UNPROVEN_LATENCY_MS;
    if (aLatency !== bLatency) return aLatency < bLatency;

    return a.lastUsedAt < b.lastUsedAt;
  }

  /**
   * Records a call that worked, and how long it took.
   *
   * The latency is what lets the pool tell a slow key from a fast one, which no
   * amount of failure counting can: a key that always answers, always in thirty
   * seconds, never fails and is still the worst one to reach for.
   */
  succeed(key: string, elapsedMs: number): void {
    if (!this.keys.includes(key)) return;

    const current = this.healthOf(key);
    const blended =
      current.latencyMs === undefined
        ? elapsedMs
        : current.latencyMs * (1 - LATENCY_SMOOTHING) + elapsedMs * LATENCY_SMOOTHING;

    this.health.set(key, {
      ...current,
      latencyMs: blended,
      // One good answer settles "is it broken now".
      consecutiveFailures: 0,
    });
  }

  /**
   * Records a call that failed, without benching the key.
   *
   * For the failures that are not quota — a timeout, a 5xx, an unreadable
   * answer. They say something about the key's usefulness right now, so they
   * move it down the order, but they are not the provider telling us to stop:
   * benching on them would take the pool apart over a network blip.
   */
  fail(key: string): void {
    if (!this.keys.includes(key)) return;

    const current = this.healthOf(key);
    this.health.set(key, {
      ...current,
      consecutiveFailures: current.consecutiveFailures + 1,
    });
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

    const current = this.healthOf(key);
    this.health.set(key, {
      ...current,
      consecutiveFailures: current.consecutiveFailures + 1,
      benchedUntil: this.now() + this.cooldownMs,
    });
  }

  /** What the pool knows about one key, for logging and for tests. */
  healthOf(key: string): KeyHealth {
    return (
      this.health.get(key) ?? { consecutiveFailures: 0, lastUsedAt: 0, benchedUntil: 0 }
    );
  }
}
