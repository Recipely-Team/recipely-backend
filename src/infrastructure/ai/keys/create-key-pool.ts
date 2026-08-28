import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { mergeApiKeys } from '@infrastructure/ai/keys/parse-api-keys';

/**
 * Builds a provider's pool from the singular and plural variables together.
 *
 * @remarks
 * Both forms are read and merged, in that order, because every box already
 * deployed sets the singular one. An operator adding `GROQ_API_KEYS` must not
 * have to remember to delete `GROQ_API_KEY` first — and if they set the same
 * key in both, {@link mergeApiKeys} drops the duplicate, so the pool does not
 * believe it has two quotas where it has one.
 */
export function createKeyPool(
  single: string | undefined,
  list: string | undefined,
  /**
   * The FREE tier, for providers that have one.
   *
   * Passed rather than read here so the paid tier can never arrive by accident:
   * imports and refinements run unattended, dozens at a time, and a pool that
   * quietly reached paid keys would spend money on work nobody asked for in
   * that moment. Only the assistant — which is per-user and per-session —
   * touches paid keys, and it does that through {@link TieredKeyPool}.
   */
  free?: string | undefined,
): ApiKeyPool {
  return new ApiKeyPool(mergeApiKeys(single, list, free));
}
