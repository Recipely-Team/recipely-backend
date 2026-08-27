import { createKeyPool } from '@infrastructure/ai/keys/create-key-pool';

/**
 * The 48 free keys the deployment holds went into `GEMINI_API_KEYS_FREE`, and
 * the import queue — which had two — could not see them. It must; the paid tier
 * it must NOT, because imports run unattended, dozens at a time, and a pool
 * that quietly reached paid keys would spend money on work nobody asked for at
 * that moment.
 */
describe('createKeyPool', () => {
  it('merges the singular, the plural and the free tier', () => {
    expect(createKeyPool('a', 'b,c', 'd,e').size).toBe(5);
  });

  it('drops a key set in two places rather than believing it has two quotas', () => {
    expect(createKeyPool('a', 'a,b', 'b,c').size).toBe(3);
  });

  it('works for a provider with no free tier at all', () => {
    expect(createKeyPool('a', 'b').size).toBe(2);
  });

  it('is empty when nothing is configured, so AI stays optional', () => {
    expect(createKeyPool(undefined, undefined, undefined).size).toBe(0);
  });
});
