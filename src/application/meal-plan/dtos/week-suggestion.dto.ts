import type { MealSlotType } from '@domain/diary/meal-slot';
import type { PlannedRecipeDto } from '@application/meal-plan/dtos/planned-recipe.dto';

/** A drafted week: one pick and one swap per open meal, nothing saved yet. */
export interface WeekSuggestionDto {
  readonly weekStart: string;
  readonly slots: readonly {
    readonly date: string;
    readonly meal: MealSlotType;
    readonly pick: PlannedRecipeDto | null;
    readonly alternative: PlannedRecipeDto | null;
  }[];
  /** How many of the user's recipes the week was drawn from; 0 means "save some first". */
  readonly poolSize: number;
}
