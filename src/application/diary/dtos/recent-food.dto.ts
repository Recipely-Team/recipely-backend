import type { RecentProductDto } from '@application/diary/dtos/recent-product.dto';
/**
 * A food logged before, ready to log again. A recipe or quick-add food comes
 * sized to ONE serving; a product comes at the quantity and unit it was
 * logged in (`servings` is that quantity, the nutrients its totals), with
 * `product.perUnit` to re-size it.
 */
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
  /**
   * Set when it was logged from a product; `null` for a recipe or quick-add
   * entry, and for a curated product whose variant has left the catalogue
   * (it is then offered as a plain food).
   */
  readonly product: RecentProductDto | null;
}
