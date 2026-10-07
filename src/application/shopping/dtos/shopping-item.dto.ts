/** One shopping-list line on the wire. */
export interface ShoppingItemDto {
  readonly id: string;
  readonly label: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly recipeId: string | null;
  readonly recipeName: string | null;
  readonly checked: boolean;
  readonly position: number;
  /** ISO 8601. */
  readonly createdAt: string;
  /** ISO 8601. */
  readonly updatedAt: string;
}
