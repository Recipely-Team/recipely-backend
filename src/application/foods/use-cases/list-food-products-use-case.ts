import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import type { FoodProductDto } from '@application/foods/dtos/food-product.dto';
import { FoodProductMapper } from '@application/foods/mappers/food-product.mapper';

export interface ListFoodProductsInput {
  readonly q?: string;
  readonly category?: string;
  readonly locale: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * **`GET /diary/foods/products`** — the curated catalogue for the Products tab,
 * one row per variant, optionally narrowed by a search term and a category.
 * Branded products are not browsable; they come through the search.
 */
export class ListFoodProductsUseCase {
  constructor(private readonly catalog: FoodCatalogInterface) {}

  async execute(input: ListFoodProductsInput): Promise<Result<PageResult<FoodProductDto>, Failure>> {
    const term = input.q?.trim();
    const found = await this.catalog.search({
      ...(term !== undefined && term.length > 0 ? { term } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      page: input.page,
      pageSize: input.pageSize,
    });
    return mapResult(found, (page) => ({ ...page, items: page.items.map((p) => FoodProductMapper.toDto(p, input.locale)) }));
  }
}
