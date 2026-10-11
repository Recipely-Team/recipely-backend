import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { DiaryLimits } from '@domain/diary/diary-limits';
import type { NutrientValues } from '@domain/diary/nutrients';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import type { Recipe } from '@domain/recipes/recipe';
import type { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import type { AddFoodLogEntryUseCase } from '@application/diary/use-cases/add-food-log-entry-use-case';
import { MealPlanMapper } from '@application/meal-plan/mappers/meal-plan.mapper';
import type { MealPlanEntryDto } from '@application/meal-plan/dtos/meal-plan-entry.dto';

export interface MarkMealPlanEntryEatenInput {
  readonly id: string;
  readonly userId: string;
  readonly locale: string;
}

const scaled = (perServing: number | undefined, servings: number, max: number): number | null =>
  perServing === undefined ? null : Math.min(perServing * servings, max);

/**
 * Logs a planned recipe to the diary, on the plan's day and meal, and links
 * the two.
 *
 * @remarks
 * - **Through the diary's own add-entry use case**, so the entry passes the
 *   same checks as one the app logs: a readable recipe, a valid name and
 *   servings, plausible numbers.
 * - **Numbers**: calories = round(caloriesPerServing × servings), each macro
 *   scaled the same way when the recipe knows it, `null` (unknown) when not.
 *   A recipe whose nutrition was never calculated stores calories as 0, and
 *   the entry is logged with 0 kcal — the same figure the diary's recipe
 *   search hands the app for that recipe, so the result matches what logging
 *   it by hand gives. Totals are clamped to the diary's per-entry caps.
 * - **Idempotent**: an already-eaten row answers as it is. Two requests at
 *   once both log, but only the first link wins; the loser's diary entry is
 *   deleted again.
 */
export class MarkMealPlanEntryEatenUseCase {
  constructor(
    private readonly repo: MealPlanRepositoryInterface,
    private readonly addFoodLogEntry: AddFoodLogEntryUseCase,
    private readonly diary: FoodDiaryRepositoryInterface,
  ) {}

  async execute(input: MarkMealPlanEntryEatenInput): Promise<Result<MealPlanEntryDto, Failure>> {
    const found = await this.repo.find(input.id, input.userId);
    if (!found.ok) return found;
    const { entry, recipe } = found.value;
    if (entry.eaten) return ok(MealPlanMapper.toDto(entry, recipe, input.locale));

    const logged = await this.addFoodLogEntry.execute(this.diaryEntryFor(entry, recipe, input));
    if (!logged.ok) return logged;

    const linked = await this.repo.linkEaten(entry.id, input.userId, logged.value.id);
    if (!linked.ok || !linked.value) await this.diary.deleteEntry(logged.value.id, input.userId);
    if (!linked.ok) return linked;

    const current = await this.repo.find(input.id, input.userId);
    if (!current.ok) return current;
    return ok(MealPlanMapper.toDto(current.value.entry, current.value.recipe, input.locale));
  }

  private diaryEntryFor(entry: MealPlanEntry, recipe: Recipe, input: MarkMealPlanEntryEatenInput) {
    const loc = recipe.localize(input.locale);
    const nutrition = loc.nutrition;
    const nutrients: NutrientValues = {
      calories: Math.min(Math.round(loc.caloriesPerServing * entry.servings), DiaryLimits.EntryCaloriesMax),
      protein: scaled(nutrition?.protein, entry.servings, DiaryLimits.EntryMacroMax),
      carbs: scaled(nutrition?.carbs, entry.servings, DiaryLimits.EntryMacroMax),
      fat: scaled(nutrition?.fat, entry.servings, DiaryLimits.EntryMacroMax),
      fiber: scaled(nutrition?.fiber, entry.servings, DiaryLimits.EntryMacroMax),
    };
    return {
      userId: input.userId,
      date: entry.date.toString(),
      meal: entry.meal,
      name: loc.name.trim().slice(0, DiaryLimits.NameMaxLength),
      servings: entry.servings,
      nutrients,
      recipeId: recipe.id,
      product: null,
    };
  }
}
