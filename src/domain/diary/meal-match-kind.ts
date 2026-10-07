/**
 * What a parsed meal item was matched to, so the app knows which entry
 * endpoint logs it.
 *
 * @remarks
 * - **`food`** — a catalogue variant; `id` is its `foodVariantId`.
 * - **`recipe`** — a recipe; `id` is the recipe id (reserved: the parser
 *   matches the food catalogue today).
 * - **`none`** — nothing in our data; the nutrients are the model's estimate.
 */
export const MealMatchKind = {
  Food: 'food',
  Recipe: 'recipe',
  None: 'none',
} as const;

export type MealMatchKindType = (typeof MealMatchKind)[keyof typeof MealMatchKind];
