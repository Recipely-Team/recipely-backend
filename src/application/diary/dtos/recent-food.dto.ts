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
}
