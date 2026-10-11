import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';
import type { MealPlanRange } from '@domain/meal-plan/meal-plan-range';

/** A plan row with the recipe it points at, read in the same query. */
export interface MealPlanRecord {
  readonly entry: MealPlanEntry;
  readonly recipe: Recipe;
}

/**
 * A user's meal plan.
 *
 * @remarks
 * - **Every lookup is scoped by owner.** Someone else's entry id answers
 *   `errors.not_found.meal_plan_entry`, exactly like an id that never existed.
 * - **A recipe the user can no longer read hides its rows.** Readable means
 *   the rule `RecipeRepositoryInterface.getById` applies: live, and published
 *   or theirs. {@link listRange} and {@link find} skip the rest, so a recipe
 *   unpublished or soft-deleted after planning never leaks.
 * - **Order** is date, then meal (the enum's display order), then position.
 */
export interface MealPlanRepositoryInterface {
  /** Readable rows in the range, ordered. */
  listRange(userId: string, range: MealPlanRange): Promise<Result<MealPlanRecord[], Failure>>;
  /** Every row in the range, readable or not — what occupies the day for its cap and positions. */
  listEntries(userId: string, range: MealPlanRange): Promise<Result<MealPlanEntry[], Failure>>;
  find(id: string, userId: string): Promise<Result<MealPlanRecord, Failure>>;
  insert(entries: readonly MealPlanEntry[]): Promise<Result<void, Failure>>;
  /** Writes date, meal, servings and position. */
  update(entry: MealPlanEntry): Promise<Result<void, Failure>>;
  /**
   * Links the diary entry only while the row is still uneaten; `false` when
   * another request linked one first.
   */
  linkEaten(id: string, userId: string, foodLogEntryId: string): Promise<Result<boolean, Failure>>;
  /** Clears the link to that diary entry, if it is still the one linked. */
  unlinkEaten(id: string, userId: string, foodLogEntryId: string): Promise<Result<void, Failure>>;
  delete(id: string, userId: string): Promise<Result<void, Failure>>;
  /** Removes every row in the range; resolves to how many went. */
  deleteRange(userId: string, range: MealPlanRange): Promise<Result<number, Failure>>;
}
