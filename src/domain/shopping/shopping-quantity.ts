import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';

const SCALE = 10 ** ShoppingListLimits.QuantityDecimals;

/**
 * **Quantity arithmetic for the shopping list.** A quantity is optional — "salt"
 * has none — so every operation takes `null` as "unknown", not zero.
 *
 * @remarks
 * - **Rounded to {@link ShoppingListLimits.QuantityDecimals} places** after
 *   every operation, so binary-float drift never reaches a stored row.
 * - **Merging an unknown into a known keeps the known amount**: "2 eggs" plus
 *   "eggs" is still 2 eggs; two unknowns stay unknown.
 */
export const ShoppingQuantity = {
  round(value: number): number {
    return Math.round(value * SCALE) / SCALE;
  },

  isValid(value: number | null): boolean {
    return value === null || (Number.isFinite(value) && value > 0 && value <= ShoppingListLimits.QuantityMax);
  },

  sum(a: number | null, b: number | null): number | null {
    if (a === null) return b === null ? null : ShoppingQuantity.round(b);
    if (b === null) return ShoppingQuantity.round(a);
    return ShoppingQuantity.round(a + b);
  },
} as const;
