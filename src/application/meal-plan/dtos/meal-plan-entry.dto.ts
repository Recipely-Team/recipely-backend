import type { MealSlotType } from '@domain/diary/meal-slot';
import type { PlannedRecipeDto } from '@application/meal-plan/dtos/planned-recipe.dto';

/** One planned recipe on the wire. */
export interface MealPlanEntryDto {
  readonly id: string;
  /** `YYYY-MM-DD`, the client's calendar day. */
  readonly date: string;
  readonly meal: MealSlotType;
  readonly position: number;
  readonly servings: number;
  readonly eaten: boolean;
  /** The diary entry it was logged as; `null` while only planned. */
  readonly foodLogEntryId: string | null;
  readonly recipe: PlannedRecipeDto;
}
