import type { PageResult } from '@domain/common/page-result';
import type { DiaryRecipeHitDto } from '@application/diary/dtos/diary-recipe-hit.dto';
import type { FoodProductDto } from '@application/foods/dtos/food-product.dto';

/**
 * `GET /diary/foods/search` without `group` — the first page of every group,
 * in the order the screen lists them. `?group=` pages one of them on its own,
 * answering that group's `PageResult` alone.
 */
export interface DiaryFoodSearchDto {
  readonly query: string;
  readonly saved: PageResult<DiaryRecipeHitDto>;
  readonly mine: PageResult<DiaryRecipeHitDto>;
  readonly products: PageResult<FoodProductDto>;
  readonly recipes: PageResult<DiaryRecipeHitDto>;
}
