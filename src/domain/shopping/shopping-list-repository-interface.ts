import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { ShoppingItem } from '@domain/shopping/shopping-item';

export interface ShoppingListSnapshot {
  /** Every item the user has, checked ones included. */
  readonly count: number;
  /** The highest position in use, or -1 for an empty list. */
  readonly maxPosition: number;
  /** The unchecked items, lowest position first. */
  readonly unchecked: ShoppingItem[];
}

/**
 * A user's shopping list.
 *
 * @remarks
 * - **Every lookup is scoped by owner.** Someone else's item id answers
 *   `not_found`, exactly like an id that never existed.
 * - **List order is unchecked first, then checked, each by position.**
 */
export interface ShoppingListRepositoryInterface {
  list(userId: string, page: number, pageSize: number): Promise<Result<PageResult<ShoppingItem>, Failure>>;
  /** What a batch add needs to plan its merge, read in one round-trip. */
  snapshot(userId: string): Promise<Result<ShoppingListSnapshot, Failure>>;
  /** Writes a planned batch in one transaction. */
  saveBatch(updated: readonly ShoppingItem[], inserted: readonly ShoppingItem[]): Promise<Result<void, Failure>>;
  find(id: string, userId: string): Promise<Result<ShoppingItem, Failure>>;
  update(item: ShoppingItem): Promise<Result<ShoppingItem, Failure>>;
  delete(id: string, userId: string): Promise<Result<void, Failure>>;
  /** Removes the checked items; resolves to how many went. */
  deleteChecked(userId: string): Promise<Result<number, Failure>>;
  /** Removes every item; resolves to how many went. */
  deleteAll(userId: string): Promise<Result<number, Failure>>;
}
