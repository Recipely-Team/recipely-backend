/**
 * The base units a food's nutrition is given per 100 of: grams for solids,
 * millilitres for drinks. Stored in `foods.default_unit` and as the unit of
 * every serving unit, and spelled the same on the wire.
 */
export const FoodUnit = {
  Gram: 'g',
  Milliliter: 'ml',
} as const;

export type FoodUnitType = (typeof FoodUnit)[keyof typeof FoodUnit];

export const isFoodUnit = (v: unknown): v is FoodUnitType =>
  (Object.values(FoodUnit) as unknown[]).includes(v);
