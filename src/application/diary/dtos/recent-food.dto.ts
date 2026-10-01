import type { LoggedProductDto } from '@application/diary/dtos/logged-product.dto';
export interface RecentFoodDto {
  readonly name: string;
  readonly servings: number;
  readonly calories: number;
  readonly protein: number | null;
  readonly carbs: number | null;
  readonly fat: number | null;
  readonly fiber: number | null;
  readonly recipeId: string | null;
  readonly recipeImageUrl: string | null;
  /** Set when it was logged from a product; `null` for a recipe or quick-add entry. */
  readonly product: LoggedProductDto | null;
}
