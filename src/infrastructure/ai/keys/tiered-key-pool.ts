import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import {
  AssistantKeyTier,
  type AssistantKeyTierType,
} from '@domain/assistant/assistant-key-tier';
import { userKeyIndex } from '@infrastructure/ai/keys/user-key-index';

/**
 * The API keys held per tier, and which one a given user is served by.
 *
 * @remarks
 * - **Two pools, never merged.** See {@link AssistantKeyTier} — a paid key must
 *   not absorb free traffic.
 * - **A user gets one key, chosen by {@link userKeyIndex} and kept.** Round-robin
 *   is right for a queue of independent jobs, which is what {@link ApiKeyPool}
 *   was built for; it is wrong for interactive sessions, where one user hopping
 *   keys can bench the whole pool by themselves.
 * - **Paid falls back to free, and never the other way.** A paying user whose
 *   tier is not configured yet still gets an assistant; a free user never
 *   reaches a key that costs money.
 * - **`penalise` still goes to the pool that issued the key**, so a quota
 *   bench is shared knowledge rather than per-user.
 */
export class TieredKeyPool {
  private readonly free: ApiKeyPool;
  private readonly paid: ApiKeyPool;

  constructor(free: readonly string[], paid: readonly string[]) {
    this.free = new ApiKeyPool(free);
    this.paid = new ApiKeyPool(paid);
  }

  /** How many keys the tier holds. Zero means the tier is not configured. */
  sizeOf(tier: AssistantKeyTierType): number {
    return this.poolFor(tier).size;
  }

  /**
   * The key this user is served by, or `null` when no tier holds any.
   *
   * Falls back to the free pool when the requested tier is empty, so adding
   * paid keys later is a deployment change rather than a code change.
   */
  keyForUser(userId: string, tier: AssistantKeyTierType): string | null {
    const wanted = this.keysOf(tier);
    if (wanted.length > 0) return wanted[userKeyIndex(userId, wanted.length)] ?? null;

    if (tier === AssistantKeyTier.Paid) {
      const free = this.keysOf(AssistantKeyTier.Free);
      if (free.length > 0) return free[userKeyIndex(userId, free.length)] ?? null;
    }
    return null;
  }

  /** Benches a key the provider refused for quota reasons, in its own tier. */
  penalise(tier: AssistantKeyTierType, key: string): void {
    this.poolFor(tier).penalise(key);
    // A paid session that fell back to a free key must bench the key it
    // actually used, not the tier it asked for.
    if (tier === AssistantKeyTier.Paid) this.free.penalise(key);
  }

  private poolFor(tier: AssistantKeyTierType): ApiKeyPool {
    return tier === AssistantKeyTier.Paid ? this.paid : this.free;
  }

  private keysOf(tier: AssistantKeyTierType): readonly string[] {
    return this.poolFor(tier).all;
  }
}
