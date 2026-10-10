/**
 * How sure the fridge scan is that it saw an ingredient. `low` is shown to the
 * user as a suggestion to confirm, never dropped.
 */
export const IngredientConfidence = {
  High: 'high',
  Low: 'low',
} as const;

export type IngredientConfidenceType = (typeof IngredientConfidence)[keyof typeof IngredientConfidence];

export const INGREDIENT_CONFIDENCES = Object.values(IngredientConfidence) as [
  IngredientConfidenceType,
  ...IngredientConfidenceType[],
];
