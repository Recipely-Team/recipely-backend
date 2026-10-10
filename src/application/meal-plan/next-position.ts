import type { MealSlotType } from '@domain/diary/meal-slot';
import type { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';

/**
 * The position after the last row of `meal` among one day's rows — 0 for an
 * empty slot, held at the cap so a long-lived slot never fails validation.
 */
export function nextPosition(day: readonly MealPlanEntry[], meal: MealSlotType): number {
  const used = day.filter((entry) => entry.meal === meal).map((entry) => entry.position);
  return used.length === 0 ? 0 : Math.min(Math.max(...used) + 1, MealPlanLimits.PositionMax);
}
