import type { ShoppingItem } from '@domain/shopping/shopping-item';

/**
 * An existing item a batch added to, and the version of it the batch read.
 *
 * @remarks
 * - **Written only if nothing changed in between:** the save matches `seenUpdatedAt`
 *   and `checked: false`, so a tick, a rename or another merge that landed after the
 *   read is never overwritten — the write is refused and the batch retried.
 */
export interface ShoppingMerge {
  readonly item: ShoppingItem;
  readonly seenUpdatedAt: Date;
}
