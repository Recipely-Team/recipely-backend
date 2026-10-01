import type { DiaryEntryRecord } from '@domain/diary/food-diary-repository-interface';
import type { NutritionGoals } from '@domain/diary/nutrition-goals';
import type { Nutrients } from '@domain/diary/nutrients';
import type { FoodLogEntryDto } from '@application/diary/dtos/food-log-entry.dto';
import type { NutritionGoalsDto } from '@application/diary/dtos/nutrition-goals.dto';
import type { NutrientTotalsDto } from '@application/diary/dtos/nutrient-totals.dto';
import type { RecentFoodDto } from '@application/diary/dtos/recent-food.dto';
import type { LoggedProductDto } from '@application/diary/dtos/logged-product.dto';
import type { LoggedProduct } from '@domain/diary/logged-product';
import { FoodSource } from '@domain/foods/food-source';

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
      product: DiaryMapper.product(entry.product),
    };
  }

  static product(product: LoggedProduct | null): LoggedProductDto | null {
    return product === null ? null : { ...product.props };
  }

  /**
   * A food the user logged before, ready to log again: one serving of a recipe
   * or quick-add food; a product at its own quantity and unit, with one unit's
   * unrounded nutrients. A curated product whose variant is gone reads as a
   * plain food.
   */
  static recent({ entry, recipeImageUrl, productFoodId }: DiaryEntryRecord): RecentFoodDto {
    const product = entry.product;
    const loggable = product !== null && (product.source !== FoodSource.Curated || product.foodVariantId !== null);
    if (product === null || !loggable) {
      return { name: entry.name, servings: 1, ...entry.perServing().values, recipeId: entry.recipeId, recipeImageUrl, product: null };
    }
    const { calories, protein, carbs, fat, fiber } = entry.nutrients.values;
    const per = (value: number | null): number | null => (value === null ? null : value / entry.servings);
    return {
      name: entry.name,
      servings: entry.servings,
      ...entry.nutrients.values,
      recipeId: null,
      recipeImageUrl: null,
      product: {
        ...product.props,
        foodId: product.source === FoodSource.Curated ? (productFoodId ?? null) : null,
        perUnit: { kcal: calories / entry.servings, protein: per(protein), carbs: per(carbs), fat: per(fat), fiber: per(fiber) },
      },
    };
  }

  /** A sum skips unknown macros, so every total is a number. */
  static totals(nutrients: Nutrients): NutrientTotalsDto {
    const { calories, protein, carbs, fat, fiber } = nutrients.values;
    return { calories, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0, fiber: fiber ?? 0 };
  }

  static goals(goals: NutritionGoals): NutritionGoalsDto {
    return { ...goals.values };
  }
}
