import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import type { FoodCategoryDto } from '@application/foods/dtos/food-category.dto';
import { FoodProductMapper } from '@application/foods/mappers/food-product.mapper';

export interface ListFoodCategoriesInput {
  readonly locale: string;
  readonly page: number;
  readonly pageSize: number;
}

/** **`GET /diary/foods/categories`** — the Products tab's shelves, named in the request locale. */
export class ListFoodCategoriesUseCase {
  constructor(private readonly catalog: FoodCatalogInterface) {}

  async execute(input: ListFoodCategoriesInput): Promise<Result<PageResult<FoodCategoryDto>, Failure>> {
    const found = await this.catalog.listCategories(input.page, input.pageSize);
    return mapResult(found, (page) => ({ ...page, items: page.items.map((c) => FoodProductMapper.toCategoryDto(c, input.locale)) }));
  }
}
