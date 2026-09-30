/**
 * Which meal of the day a food-diary entry belongs to.
 *
 * @remarks
 * - **Declaration order is display order.** The Postgres enum is declared in
 *   the same order, so `ORDER BY meal` lists a day breakfast-first without a
 *   CASE expression.
 */
export const MealSlot = {
  Breakfast: 'BREAKFAST',
  Lunch: 'LUNCH',
  Dinner: 'DINNER',
  Snack: 'SNACK',
} as const;

export type MealSlotType = (typeof MealSlot)[keyof typeof MealSlot];

export const MEAL_SLOTS = Object.values(MealSlot) as [MealSlotType, ...MealSlotType[]];
