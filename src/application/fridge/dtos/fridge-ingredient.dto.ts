import type { IngredientConfidenceType } from '@domain/fridge/ingredient-confidence';

/** One recognised ingredient: lower-case, singular, no quantity, in the request's language. */
export interface FridgeIngredientDto {
  readonly name: string;
  readonly confidence: IngredientConfidenceType;
}
