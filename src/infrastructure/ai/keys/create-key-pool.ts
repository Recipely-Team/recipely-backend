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
export function createKeyPool(single: string | undefined, list: string | undefined): ApiKeyPool {
  return new ApiKeyPool(mergeApiKeys(single, list));
}
