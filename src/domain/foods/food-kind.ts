import { FoodUnit, type FoodUnitType } from '@domain/foods/food-unit';

/** Whether a product is eaten or drunk — read off its base unit: millilitres are a drink. */
export const FoodKind = {
  Food: 'food',
  Drink: 'drink',
} as const;

export type FoodKindType = (typeof FoodKind)[keyof typeof FoodKind];

export const foodKindOf = (unit: FoodUnitType): FoodKindType =>
  unit === FoodUnit.Milliliter ? FoodKind.Drink : FoodKind.Food;
