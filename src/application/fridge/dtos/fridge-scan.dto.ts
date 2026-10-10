import type { FridgeIngredientDto } from '@application/fridge/dtos/fridge-ingredient.dto';

/** `POST /fridge/scan`: at most 30 ingredients, deduplicated. */
export interface FridgeScanDto {
  readonly ingredients: readonly FridgeIngredientDto[];
}
