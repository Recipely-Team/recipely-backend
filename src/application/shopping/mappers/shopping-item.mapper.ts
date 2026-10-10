import type { ShoppingItem } from '@domain/shopping/shopping-item';
import type { ShoppingItemDto } from '@application/shopping/dtos/shopping-item.dto';

/** Shopping-list domain objects → wire DTOs. */
export class ShoppingItemMapper {
  static toDto(item: ShoppingItem): ShoppingItemDto {
    return {
      id: item.id,
      label: item.label,
      quantity: item.quantity,
      unit: item.unit,
      recipeId: item.recipeId,
      recipeName: item.recipeName,
      checked: item.checked,
      position: item.position,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
