import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { FoodProductData } from '@application/foods/food-product-data';
import type { FoodDetailData } from '@application/foods/food-detail-data';
import type { FoodCategoryData } from '@application/foods/food-category-data';

export interface FoodCatalogQuery {
  /** Every word must match the food + variant name in one locale (folded); absent lists all. */
  readonly term?: string;
  readonly category?: string;
  readonly page: number;
  readonly pageSize: number;
}

/** The curated food catalogue (`food_categories`, `foods`, `food_variants`). */
export interface FoodCatalogInterface {
  /**
   * Variants, one row each, matching the query — the recipe search's folded
   * matching. With a term, foods whose name starts with it first; then
   * catalogue rank (most common first) and the variant's position.
   */
  search(query: FoodCatalogQuery): Promise<Result<PageResult<FoodProductData>, Failure>>;
  /** One variant by id; `null` when there is none. */
  findVariant(id: string): Promise<Result<FoodProductData | null, Failure>>;
  /** One food with all its variants; `null` when there is none. */
  findFood(id: string): Promise<Result<FoodDetailData | null, Failure>>;
  /** Categories in catalogue order, each with its product (food) count. */
  listCategories(page: number, pageSize: number): Promise<Result<PageResult<FoodCategoryData>, Failure>>;
}
