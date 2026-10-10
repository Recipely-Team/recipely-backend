import type { PlannedRecipeIngredientsDto } from '@application/meal-plan/dtos/planned-recipe-ingredients.dto';

/** `GET /me/meal-plan/ingredients`: one row per distinct recipe, in first-planned order. */
export interface MealPlanIngredientsDto {
  readonly recipes: readonly PlannedRecipeIngredientsDto[];
}
