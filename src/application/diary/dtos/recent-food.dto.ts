export interface RecentFoodDto {
  readonly name: string;
  readonly servings: number;
  readonly calories: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  readonly fiber: number | null;
  readonly recipeId: string | null;
  readonly recipeImageUrl: string | null;
}
