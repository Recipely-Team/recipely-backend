/**
 * The pool exists because these providers rate-limit per KEY. Everything below
 * is about that: spread the load, survive a quota, and never end up with
 * nothing to try.
 */

import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { parseApiKeys } from '@infrastructure/ai/keys/parse-api-keys';

const COOLDOWN = 60_000;

/** A clock the test moves by hand, so cooldowns are exact rather than slept through. */
const clock = () => {
  let now = 1_000_000;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
};

describe('parseApiKeys', () => {
  it('reads any number of keys from one variable', () => {
    expect(parseApiKeys('a,b,c,d,e')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('ignores the whitespace an operator pastes in', () => {
    expect(parseApiKeys(' a , b ,c ')).toEqual(['a', 'b', 'c']);
  });

  it('drops duplicates — two copies of a key are not two quotas', () => {
    expect(parseApiKeys('a,b,a')).toEqual(['a', 'b']);
  });

  it('treats unset and empty as no keys at all', () => {
    expect(parseApiKeys(undefined)).toEqual([]);
    expect(parseApiKeys('')).toEqual([]);
    expect(parseApiKeys(' , , ')).toEqual([]);
  });
});

describe('ApiKeyPool', () => {
  it('reports not-configured when it holds nothing', () => {
    const pool = new ApiKeyPool([]);

    expect(pool.size).toBe(0);
    expect(pool.next()).toBeNull();
  });

  it('spreads calls across the keys instead of hammering the first', () => {
    const pool = new ApiKeyPool(['a', 'b', 'c']);

    expect([pool.next(), pool.next(), pool.next(), pool.next()]).toEqual(['a', 'b', 'c', 'a']);
  });

  it('skips a key the provider just rate-limited', () => {
    const pool = new ApiKeyPool(['a', 'b']);
    pool.penalise('a');

    // 'a' is benched, so both calls land on the key that still has quota.
    expect([pool.next(), pool.next()]).toEqual(['b', 'b']);
  });

  it('brings a benched key back once its cooldown has passed', () => {
    const time = clock();
    const pool = new ApiKeyPool(['a', 'b'], COOLDOWN, time.now);
    pool.penalise('a');
    expect(pool.next()).toBe('b');

    time.advance(COOLDOWN + 1);

    // A quota is a moment, not a verdict.
    expect([pool.next(), pool.next()]).toContain('a');
  });

  it('still offers a key when every one of them is benched', () => {
    const time = clock();
    const pool = new ApiKeyPool(['a', 'b'], COOLDOWN, time.now);
    pool.penalise('a');
    time.advance(1000);
    pool.penalise('b');

    // Refusing to make the request would be worse: the provider is the
    // authority on whether the limit has lifted, and 'a' has waited longest.
    expect(pool.next()).toBe('a');
  });

  it('ignores a penalty for a key it does not hold', () => {
    const pool = new ApiKeyPool(['a']);

    pool.penalise('someone-elses-key');

    expect(pool.next()).toBe('a');
  });
});
