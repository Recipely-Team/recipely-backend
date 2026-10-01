import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import type { FoodDetailDto } from '@application/foods/dtos/food-detail.dto';
import { FoodProductMapper } from '@application/foods/mappers/food-product.mapper';

export interface GetFoodProductInput {
  readonly foodId: string;
  readonly locale: string;
}

/** **`GET /diary/foods/products/:id`** — a curated food with every variant; `errors.not_found.food` otherwise. */
export class GetFoodProductUseCase {
  constructor(private readonly catalog: FoodCatalogInterface) {}

  async execute(input: GetFoodProductInput): Promise<Result<FoodDetailDto, Failure>> {
    const found = await this.catalog.findFood(input.foodId);
    if (!found.ok) return found;
    if (found.value === null) return fail(new NotFoundFailure('errors.not_found.food'));
    return ok(FoodProductMapper.toDetailDto(found.value, input.locale));
  }
}
