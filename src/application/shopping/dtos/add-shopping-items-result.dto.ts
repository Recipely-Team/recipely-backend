import type { ShoppingItemDto } from '@application/shopping/dtos/shopping-item.dto';

/** What a batch add answers: every line it touched, and how it got there. */
export interface AddShoppingItemsResultDto {
  /** Final state of each inserted or merged-into item, in first-touch order. */
  readonly items: ShoppingItemDto[];
  /** New lines created. */
  readonly added: number;
  /** Existing unchecked lines whose quantity grew. */
  readonly merged: number;
}
