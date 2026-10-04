/**
 * **A small in-process cache with a time-to-live and a size cap.**
 *
 * @remarks
 * - Memory-bounded on purpose (the api container has 384 MiB): past
 *   `maxEntries` the oldest insertion is evicted, so the cache never grows with
 *   traffic.
 * - Per process, lost on restart — fine for answers that are merely expensive
 *   to fetch, never for state.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { readonly value: V; readonly expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}
