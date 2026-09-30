import { randomUUID } from 'crypto';
import { fail, mapResult, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import { FoodLogEntry } from '@domain/diary/food-log-entry';
import type { MealSlotType } from '@domain/diary/meal-slot';
import { Nutrients, type NutrientValues } from '@domain/diary/nutrients';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { FoodLogEntryDto } from '@application/diary/dtos/food-log-entry.dto';

export interface AddFoodLogEntryInput {
  readonly userId: string;
  readonly date: string;
  readonly meal: MealSlotType;
  readonly name: string;
  readonly servings: number;
  readonly nutrients: NutrientValues;
  readonly recipeId: string | null;
}

/**
 * Logs a food against a day and a meal.
 *
 * @remarks
 * - **A linked recipe must be one the user can read** — published, or their
 *   own. `RecipeRepositoryInterface.getById` already hides everything else, so
 *   an unreadable recipe answers the same `not_found` as a missing one.
 * - **The numbers are stored as sent**, never recomputed from the recipe.
 */
export class AddFoodLogEntryUseCase {
  constructor(
    private readonly repo: FoodDiaryRepositoryInterface,
    private readonly recipes: RecipeRepositoryInterface,
  ) {}

  async execute(input: AddFoodLogEntryInput): Promise<Result<FoodLogEntryDto, Failure>> {
    const date = CalendarDate.parse(input.date);
    if (!date.ok) return date;
    const nutrients = Nutrients.create(input.nutrients);
    if (!nutrients.ok) return nutrients;

    if (input.recipeId !== null) {
      const recipe = await this.recipes.getById(input.recipeId, input.userId);
      if (!recipe.ok) {
        return recipe.failure.code === 'not_found' ? fail(new NotFoundFailure('errors.not_found.recipe')) : recipe;
      }
    }

    const now = new Date();
    const entry = FoodLogEntry.create({
      id: randomUUID(),
      userId: input.userId,
      date: date.value,
      meal: input.meal,
      name: input.name,
      servings: input.servings,
      nutrients: nutrients.value,
      recipeId: input.recipeId,
      createdAt: now,
      updatedAt: now,
    });
    if (!entry.ok) return entry;

    return mapResult(await this.repo.insertEntry(entry.value), DiaryMapper.entry);
  }
}
