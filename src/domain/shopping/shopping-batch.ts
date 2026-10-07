import { ConflictFailure, type ValidationFailure } from '@core/failure';
import { fail, ok, type Result } from '@core/result/result';
import { ShoppingItem } from '@domain/shopping/shopping-item';
import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';

/** One incoming line, before it has an id or a place in the list. */
export interface ShoppingItemData {
  readonly label: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly recipeId: string | null;
  readonly recipeName: string | null;
}

export interface ShoppingBatchInput {
  readonly userId: string;
  /** The user's unchecked items, lowest position first — the only merge targets. */
  readonly unchecked: readonly ShoppingItem[];
  /** How many items the user has in total, checked ones included. */
  readonly currentCount: number;
  /** The position the first inserted item takes; each further insert takes the next. */
  readonly nextPosition: number;
  readonly incoming: readonly ShoppingItemData[];
  readonly now: Date;
  readonly newId: () => string;
}

export interface ShoppingBatchResult {
  readonly updated: ShoppingItem[];
  readonly inserted: ShoppingItem[];
  /** The final state of every item the batch touched, in first-touch order. */
  readonly touched: ShoppingItem[];
}

interface Slot {
  item: ShoppingItem;
  readonly isNew: boolean;
  changed: boolean;
}

/**
 * **Folds a batch of incoming lines into a shopping list.**
 *
 * @remarks
 * - **Merge rule** — an incoming line joins an existing UNCHECKED item with the
 *   same {@link ShoppingItem.mergeKey} (folded label + folded unit), summing the
 *   quantities; otherwise it is inserted. Lines inside one batch merge with each
 *   other the same way, so a recipe listing salt twice adds one line.
 * - **The cap counts inserts only** — a batch that merges entirely is allowed on
 *   a full list. Past {@link ShoppingListLimits.ItemsPerUserMax} it is refused
 *   whole (`conflict`), never half-applied.
 * - **One invalid line refuses the batch**, with that line's validation key.
 */
export function planShoppingBatch(input: ShoppingBatchInput): Result<ShoppingBatchResult, ValidationFailure | ConflictFailure> {
  const slots = new Map<string, Slot>();
  for (const item of input.unchecked) {
    if (!slots.has(item.mergeKey)) slots.set(item.mergeKey, { item, isNew: false, changed: false });
  }
  const order: Slot[] = [];
  let position = input.nextPosition;

  for (const line of input.incoming) {
    const built = ShoppingItem.create({
      ...line,
      id: input.newId(),
      userId: input.userId,
      checked: false,
      position,
      createdAt: input.now,
      updatedAt: input.now,
    });
    if (!built.ok) return built;

    const slot = slots.get(built.value.mergeKey);
    if (slot === undefined) {
      const fresh: Slot = { item: built.value, isNew: true, changed: true };
      slots.set(built.value.mergeKey, fresh);
      order.push(fresh);
      position += 1;
      continue;
    }
    const merged = slot.item.absorb(built.value, input.now);
    if (!merged.ok) return merged;
    slot.item = merged.value;
    slot.changed = true;
    if (!order.includes(slot)) order.push(slot);
  }

  const inserted = order.filter((slot) => slot.isNew).map((slot) => slot.item);
  if (input.currentCount + inserted.length > ShoppingListLimits.ItemsPerUserMax) {
    return fail(new ConflictFailure('errors.conflict.shopping_list_full'));
  }
  return ok({
    updated: order.filter((slot) => !slot.isNew && slot.changed).map((slot) => slot.item),
    inserted,
    touched: order.map((slot) => slot.item),
  });
}
