import { TtlCache } from '@infrastructure/cache/ttl-cache';

describe('TtlCache', () => {
  it('answers a value until its time is up', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, 10, () => now);
    cache.set('a', 'x');
    now = 999;
    expect(cache.get('a')).toBe('x');
    now = 1000;
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the oldest entry past its cap, so memory stays bounded', () => {
    const cache = new TtlCache<number>(60_000, 2, () => 0);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect([cache.get('b'), cache.get('c')]).toEqual([2, 3]);
  });

  it('caches null as an answer, apart from a miss', () => {
    const cache = new TtlCache<string | null>(1000, 2, () => 0);
    cache.set('none', null);
    expect(cache.get('none')).toBeNull();
    expect(cache.get('other')).toBeUndefined();
  });
});
