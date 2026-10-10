/** The diet a fridge idea request may ask the ideas to respect. */
export const FridgeDiet = {
  None: 'none',
  Vegetarian: 'vegetarian',
  Vegan: 'vegan',
  HighProtein: 'highProtein',
} as const;

export type FridgeDietType = (typeof FridgeDiet)[keyof typeof FridgeDiet];

export const FRIDGE_DIETS = Object.values(FridgeDiet) as [FridgeDietType, ...FridgeDietType[]];
