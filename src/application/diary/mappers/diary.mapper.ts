import type { DiaryEntryRecord } from '@domain/diary/food-diary-repository-interface';
import type { NutritionGoals } from '@domain/diary/nutrition-goals';
import type { Nutrients } from '@domain/diary/nutrients';
import type { FoodLogEntryDto } from '@application/diary/dtos/food-log-entry.dto';
import type { NutritionGoalsDto } from '@application/diary/dtos/nutrition-goals.dto';
import type { NutrientTotalsDto } from '@application/diary/dtos/nutrient-totals.dto';
import type { RecentFoodDto } from '@application/diary/dtos/recent-food.dto';

/** Food-diary domain objects → wire DTOs. */
export class DiaryMapper {
  static entry({ entry, recipeImageUrl }: DiaryEntryRecord): FoodLogEntryDto {
    return {
      id: entry.id,
      date: entry.date.toString(),
      meal: entry.meal,
      name: entry.name,
      servings: entry.servings,
      ...entry.nutrients.values,
      recipeId: entry.recipeId,
      recipeImageUrl,
    };
  }

  /** One serving of a food the user logged before, ready to log again. */
  static recent({ entry, recipeImageUrl }: DiaryEntryRecord): RecentFoodDto {
    return {
      name: entry.name,
      servings: 1,
      ...entry.perServing().values,
      recipeId: entry.recipeId,
      recipeImageUrl,
    };
  }

  static totals(nutrients: Nutrients): NutrientTotalsDto {
    const { calories, protein, carbs, fat, fiber } = nutrients.values;
    return { calories, protein, carbs, fat, fiber: fiber ?? 0 };
  }

  static goals(goals: NutritionGoals): NutritionGoalsDto {
    return { ...goals.values };
  }
}
