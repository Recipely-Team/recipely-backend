import type { Recipe } from '@domain/recipes/recipe';
import type { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';
import type { MealPlanEntryDto } from '@application/meal-plan/dtos/meal-plan-entry.dto';
import type { PlannedRecipeDto } from '@application/meal-plan/dtos/planned-recipe.dto';

const positiveOrNull = (value: number): number | null => (value > 0 ? value : null);

/** Meal-plan domain objects → wire DTOs, the recipe resolved to one locale. */
export class MealPlanMapper {
  static toDto(entry: MealPlanEntry, recipe: Recipe, locale: string): MealPlanEntryDto {
    return {
      id: entry.id,
      date: entry.date.toString(),
      meal: entry.meal,
      position: entry.position,
      servings: entry.servings,
      eaten: entry.eaten,
      foodLogEntryId: entry.foodLogEntryId,
      recipe: MealPlanMapper.recipe(recipe, locale),
    };
  }

  static recipe(recipe: Recipe, locale: string): PlannedRecipeDto {
    const loc = recipe.localize(locale);
    return {
      id: recipe.id,
      name: loc.name,
      imageUrl: loc.image.length > 0 ? loc.image : null,
      caloriesPerServing: positiveOrNull(loc.caloriesPerServing),
      servings: loc.servings,
      totalTimeMinutes: positiveOrNull(loc.prepTimeMinutes + loc.cookTimeMinutes),
    };
  }
}
