import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRecord, MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import type { MealPlanIngredientsDto } from '@application/meal-plan/dtos/meal-plan-ingredients.dto';
import type { PlannedRecipeIngredientsDto } from '@application/meal-plan/dtos/planned-recipe-ingredients.dto';

export interface ListMealPlanIngredientsInput {
  readonly userId: string;
  readonly from: string;
  readonly to: string;
  readonly locale: string;
}

/**
 * What a range of the plan needs bought: one row per distinct recipe, its
 * planned servings summed, its ingredient lines in the request's locale.
 *
 * @remarks
 * - **Not scaled or merged here.** Lines are free text ("2 su bardağı un");
 *   the app parses, scales by `plannedServings / recipeServings`, merges and
 *   posts them to the shopping list, which merges again on its side.
 * - **Eaten rows count too** — the list is for the whole range as planned.
 */
export class ListMealPlanIngredientsUseCase {
  constructor(private readonly repo: MealPlanRepositoryInterface) {}

  async execute(input: ListMealPlanIngredientsInput): Promise<Result<MealPlanIngredientsDto, Failure>> {
    const range = MealPlanRange.create(input.from, input.to);
    if (!range.ok) return range;
    return mapResult(await this.repo.listRange(input.userId, range.value), (records) => ({
      recipes: groupByRecipe(records, input.locale),
    }));
  }
}

function groupByRecipe(records: readonly MealPlanRecord[], locale: string): PlannedRecipeIngredientsDto[] {
  const grouped = new Map<string, PlannedRecipeIngredientsDto>();
  for (const { entry, recipe } of records) {
    const seen = grouped.get(recipe.id);
    if (seen !== undefined) {
      grouped.set(recipe.id, { ...seen, plannedServings: seen.plannedServings + entry.servings });
      continue;
    }
    const loc = recipe.localize(locale);
    grouped.set(recipe.id, {
      recipeId: recipe.id,
      recipeName: loc.name,
      plannedServings: entry.servings,
      recipeServings: loc.servings,
      ingredients: loc.ingredients,
    });
  }
  return [...grouped.values()];
}
