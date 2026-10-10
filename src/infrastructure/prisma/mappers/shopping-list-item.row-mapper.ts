import type { ShoppingListItem as ShoppingListItemRow } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { ShoppingItem } from '@domain/shopping/shopping-item';

/**
 * `shopping_list_items` rows → {@link ShoppingItem}, and back to columns.
 * A row the entity refuses is reported as corrupt, not thrown.
 */
export class ShoppingListItemRowMapper {
  static toDomain(row: ShoppingListItemRow): Result<ShoppingItem, Failure> {
    const item = ShoppingItem.create({ ...row });
    return item.ok ? item : fail(new UnknownFailure(`corrupt shopping_list_items row ${row.id}: ${item.failure.messageKey}`));
  }

  static toDomainList(rows: readonly ShoppingListItemRow[]): Result<ShoppingItem[], Failure> {
    const items: ShoppingItem[] = [];
    for (const row of rows) {
      const item = ShoppingListItemRowMapper.toDomain(row);
      if (!item.ok) return item;
      items.push(item.value);
    }
    return ok(items);
  }

  /** The columns an edit or a merge may change. */
  static mutableColumns(item: ShoppingItem) {
    return {
      label: item.label,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      updatedAt: item.updatedAt,
    };
  }

  static insertColumns(item: ShoppingItem) {
    return {
      id: item.id,
      userId: item.userId,
      recipeId: item.recipeId,
      recipeName: item.recipeName,
      position: item.position,
      createdAt: item.createdAt,
      ...ShoppingListItemRowMapper.mutableColumns(item),
    };
  }
}
