import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';

/**
 * Production ran the whole assistant on one Gemini key while 48 sat unused, and
 * when that key went slow every request went slow with it. Holding more keys
 * only helps if the pool prefers the ones that are actually working — so the
 * order is decided by how each key has been behaving, worst last.
 */

const COOLDOWN_MS = 60_000;

/** A clock the test moves by hand, so nothing here waits on real time. */
function clock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('which key the pool reaches for', () => {
  it('prefers the faster key once both have answered', () => {
    const time = clock();
    const pool = new ApiKeyPool(['slow', 'fast'], COOLDOWN_MS, time.now);

    pool.succeed('slow', 9_000);
    pool.succeed('fast', 400);

    expect(pool.next()).toBe('fast');
  });

  /**
   * A key that always answers, always in thirty seconds, never fails — and is
   * still the worst one to reach for. No amount of failure counting finds that;
   * only latency does.
   */
  it('demotes a key that got slower, without it ever failing', () => {
    const time = clock();
    const pool = new ApiKeyPool(['a', 'b'], COOLDOWN_MS, time.now);

    pool.succeed('a', 500);
    pool.succeed('b', 600);
    expect(pool.next()).toBe('a');

    // `a` degrades over several calls; the average follows it down.
    for (const _ of [0, 0, 0, 0, 0]) pool.succeed('a', 30_000);

    expect(pool.next()).toBe('b');
  });

  it('puts a repeatedly failing key behind a healthy one', () => {
    const time = clock();
    const pool = new ApiKeyPool(['broken', 'ok'], COOLDOWN_MS, time.now);

    // `broken` is the faster of the two on paper — health still wins.
    pool.succeed('broken', 100);
    pool.succeed('ok', 5_000);
    pool.fail('broken');
    pool.fail('broken');

    expect(pool.next()).toBe('ok');
  });

  it('forgives a key the moment it works again', () => {
    const time = clock();
    const pool = new ApiKeyPool(['a', 'b'], COOLDOWN_MS, time.now);

    pool.fail('a');
    pool.fail('a');
    pool.succeed('b', 5_000);
    expect(pool.next()).toBe('b');

    pool.succeed('a', 100);

    expect(pool.next()).toBe('a');
  });

  /**
   * The trap this design exists to avoid. "Always use the best key" is the
   * single-key setup that already failed here — these providers rate-limit per
   * KEY, so funnelling every request into the fastest one walks it into its own
   * quota and turns a pool back into one key.
   */
  it('spreads across equally healthy keys instead of hammering one', () => {
    const time = clock();
    const pool = new ApiKeyPool(['a', 'b', 'c'], COOLDOWN_MS, time.now);

    const handedOut = [pool.next(), pool.next(), pool.next()];

    expect(new Set(handedOut).size).toBe(3);
  });

  it('tries an unproven key before a known-slow one', () => {
    const time = clock();
    const pool = new ApiKeyPool(['known', 'fresh'], COOLDOWN_MS, time.now);

    pool.succeed('known', 20_000);

    // Optimism about the unknown: a key ranked last is never tried, so it can
    // never earn a better rank.
    expect(pool.next()).toBe('fresh');
  });

  describe('benching', () => {
    it('keeps a rate-limited key out of the rotation', () => {
      const time = clock();
      const pool = new ApiKeyPool(['a', 'b'], COOLDOWN_MS, time.now);

      pool.penalise('a');

      expect(pool.next()).toBe('b');
      expect(pool.next()).toBe('b');
    });

    it('lets it back once the cooldown passes', () => {
      const time = clock();
      const pool = new ApiKeyPool(['a', 'b'], COOLDOWN_MS, time.now);

      pool.penalise('a');
      pool.succeed('b', 9_000);
      time.advance(COOLDOWN_MS + 1);
      pool.succeed('a', 100);

      expect(pool.next()).toBe('a');
    });

    // A stale quota is a better bet than refusing to make the request at all —
    // the provider is the authority on whether the limit has really lifted.
    it('hands back the soonest-free key when every one is benched', () => {
      const time = clock();
      const pool = new ApiKeyPool(['a', 'b'], COOLDOWN_MS, time.now);

      pool.penalise('a');
      time.advance(1_000);
      pool.penalise('b');

      expect(pool.next()).toBe('a');
    });
  });
});
