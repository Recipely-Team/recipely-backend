import type { MealPlanEntryDto } from '@application/meal-plan/dtos/meal-plan-entry.dto';

/** `GET /me/meal-plan`: the range asked for and its entries, by date, meal, position. */
export interface MealPlanDto {
  readonly from: string;
  readonly to: string;
  readonly entries: readonly MealPlanEntryDto[];
}
