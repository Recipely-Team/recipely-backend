import { TieredKeyPool } from '@infrastructure/ai/keys/tiered-key-pool';
import { AssistantKeyTier } from '@domain/assistant/assistant-key-tier';
import { userKeyIndex } from '@infrastructure/ai/keys/user-key-index';

const keys = (n: number, prefix = 'free'): string[] =>
  Array.from({ length: n }, (_, at) => `${prefix}-${at}`);

describe('TieredKeyPool', () => {
  it('serves a user from the same key every time', () => {
    const pool = new TieredKeyPool(keys(48), []);

    const first = pool.keyForUser('user-a', AssistantKeyTier.Free);
    for (let again = 0; again < 20; again += 1) {
      expect(pool.keyForUser('user-a', AssistantKeyTier.Free)).toBe(first);
    }
  });

  // The requirement: one key per user, spread evenly. 48 users over 48 keys is
  // one each; 96 is two each. A hash cannot promise exactness, so this asserts
  // the shape that matters — nobody carries a wildly disproportionate share.
  it('spreads users across the pool rather than crowding one key', () => {
    const pool = new TieredKeyPool(keys(48), []);
    const perKey = new Map<string, number>();

    for (let user = 0; user < 4_800; user += 1) {
      const key = pool.keyForUser(`user-${user}`, AssistantKeyTier.Free);
      perKey.set(key ?? 'none', (perKey.get(key ?? 'none') ?? 0) + 1);
    }

    // Every key used, and none carrying more than double the fair share of 100.
    expect(perKey.size).toBe(48);
    for (const count of perKey.values()) {
      expect(count).toBeGreaterThan(40);
      expect(count).toBeLessThan(200);
    }
  });

  it('never hands a free user a paid key', () => {
    const pool = new TieredKeyPool(keys(3), keys(3, 'paid'));

    for (let user = 0; user < 200; user += 1) {
      const key = pool.keyForUser(`user-${user}`, AssistantKeyTier.Free);
      expect(key?.startsWith('free-')).toBe(true);
    }
  });

  it('serves a paid user from the paid pool', () => {
    const pool = new TieredKeyPool(keys(3), keys(3, 'paid'));

    expect(pool.keyForUser('user-a', AssistantKeyTier.Paid)?.startsWith('paid-')).toBe(true);
  });

  // Paid keys are not configured yet, and a paying user must still get an
  // assistant — adding them later is a deployment change, not a code change.
  it('falls back to free when the paid tier is empty', () => {
    const pool = new TieredKeyPool(keys(3), []);

    expect(pool.keyForUser('user-a', AssistantKeyTier.Paid)?.startsWith('free-')).toBe(true);
  });

  it('has nothing to hand out when neither tier is configured', () => {
    expect(new TieredKeyPool([], []).keyForUser('user-a', AssistantKeyTier.Free)).toBeNull();
  });

  it('reports each tier size, so a caller can tell "unset" from "empty"', () => {
    const pool = new TieredKeyPool(keys(48), keys(2, 'paid'));

    expect(pool.sizeOf(AssistantKeyTier.Free)).toBe(48);
    expect(pool.sizeOf(AssistantKeyTier.Paid)).toBe(2);
  });
});

describe('userKeyIndex', () => {
  it('stays inside the pool', () => {
    for (let user = 0; user < 500; user += 1) {
      const at = userKeyIndex(`user-${user}`, 48);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(48);
    }
  });

  // The divisor is the live pool size: a revoked key must not leave a share of
  // users pointing past the end of the list.
  it('follows the pool when it shrinks', () => {
    expect(userKeyIndex('user-a', 1)).toBe(0);
    expect(userKeyIndex('user-a', 48)).toBeLessThan(48);
  });

  it('does not divide by an empty pool', () => {
    expect(userKeyIndex('user-a', 0)).toBe(0);
  });
});
