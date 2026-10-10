/**
 * The bounds every shopping-list value is held to, named once so the request
 * validators and the domain factories cannot drift apart.
 *
 * @remarks
 * - **Quantity caps are plausibility**, there to keep a mistyped extra zero out
 *   of a merged total, so they sit far past any real kitchen (100 kg is 100000 g).
 * - **The per-user cap bounds the list query and the merge scan**, which reads
 *   every unchecked item once per batch.
 */
export const ShoppingListLimits = {
  LabelMaxLength: 120,
  UnitMaxLength: 24,
  RecipeNameMaxLength: 200,
  QuantityMax: 100_000,
  /** Decimal places a quantity is rounded to, so 0.1 + 0.2 stays 0.3. */
  QuantityDecimals: 3,
  ItemsPerUserMax: 500,
  BatchMax: 100,
} as const;
