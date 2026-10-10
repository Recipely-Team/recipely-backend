import { randomUUID } from 'crypto';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import type { MealSlotType } from '@domain/diary/meal-slot';
import { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';
import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { MealPlanMapper } from '@application/meal-plan/mappers/meal-plan.mapper';
import { nextPosition } from '@application/meal-plan/next-position';
import type { MealPlanEntryDto } from '@application/meal-plan/dtos/meal-plan-entry.dto';

export interface AddMealPlanEntryInput {
  readonly userId: string;
  readonly date: string;
  readonly meal: MealSlotType;
  readonly recipeId: string;
  readonly servings: number;
  readonly locale: string;
}

/**
 * Plans a recipe for a day and a meal, at the end of that slot.
 *
 * @remarks
 * - **The recipe must be one the user can read** (published, or their own);
 *   anything else is `errors.not_found.recipe`, like a missing id.
 * - **At most {@link MealPlanLimits.EntriesPerDayMax} rows a day** —
 *   `errors.conflict.meal_plan_day_full` past it.
 */
export class AddMealPlanEntryUseCase {
  constructor(
    private readonly repo: MealPlanRepositoryInterface,
    private readonly recipes: RecipeRepositoryInterface,
  ) {}

  async execute(input: AddMealPlanEntryInput): Promise<Result<MealPlanEntryDto, Failure>> {
    const date = CalendarDate.parse(input.date);
    if (!date.ok) return date;

    const recipe = await this.recipes.getById(input.recipeId, input.userId);
    if (!recipe.ok) {
      return recipe.failure.code === 'not_found' ? fail(new NotFoundFailure('errors.not_found.recipe')) : recipe;
    }

    const day = await this.repo.listEntries(input.userId, MealPlanRange.day(date.value));
    if (!day.ok) return day;
    if (day.value.length >= MealPlanLimits.EntriesPerDayMax) {
      return fail(new ConflictFailure('errors.conflict.meal_plan_day_full'));
    }

    const now = new Date();
    const entry = MealPlanEntry.create({
      id: randomUUID(),
      userId: input.userId,
      date: date.value,
      meal: input.meal,
      recipeId: input.recipeId,
      servings: input.servings,
      position: nextPosition(day.value, input.meal),
      foodLogEntryId: null,
      createdAt: now,
      updatedAt: now,
    });
    if (!entry.ok) return entry;

    const saved = await this.repo.insert([entry.value]);
    if (!saved.ok) return saved;
    return ok(MealPlanMapper.toDto(entry.value, recipe.value.recipe, input.locale));
  }
}
