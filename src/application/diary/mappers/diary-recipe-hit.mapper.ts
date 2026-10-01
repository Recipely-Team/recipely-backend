import type { Recipe } from '@domain/recipes/recipe';
import type { DiaryRecipeHitDto } from '@application/diary/dtos/diary-recipe-hit.dto';

/** **A recipe as the diary search lists it**: per-serving numbers, unknown macros as `null`. */
export class DiaryRecipeHitMapper {
  static toDto(recipe: Recipe, locale: string): DiaryRecipeHitDto {
    const loc = recipe.localize(locale);
    const nutrition = loc.nutrition;
    return {
      id: recipe.id,
      name: loc.name,
      image: loc.image,
      servings: loc.servings,
      caloriesPerServing: loc.caloriesPerServing,
      protein: nutrition?.protein ?? null,
      carbs: nutrition?.carbs ?? null,
      fat: nutrition?.fat ?? null,
      fiber: nutrition?.fiber ?? null,
      servingWeightGrams: nutrition?.servingWeightGrams ?? null,
      status: recipe.moderationStatus,
      isPublished: recipe.isPublished,
    };
  }
}
