import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import type { BrandedFoodSearchInterface } from '@application/foods/ports/branded-food-search-interface';
import type { FoodDetailDto } from '@application/foods/dtos/food-detail.dto';
import { FoodProductMapper } from '@application/foods/mappers/food-product.mapper';

export interface GetBrandedProductInput {
  readonly barcode: string;
  readonly locale: string;
}

/**
 * **`GET /diary/foods/products/barcode/:barcode`** — an Open Food Facts product
 * as a one-variant detail. `errors.not_found.food` when the database has none
 * worth offering; a 503 (`errors.foods.branded_unavailable`) when it is down —
 * here, unlike in the search, there is nothing else to show.
 */
export class GetBrandedProductUseCase {
  constructor(private readonly branded: BrandedFoodSearchInterface) {}

  async execute(input: GetBrandedProductInput): Promise<Result<FoodDetailDto, Failure>> {
    const found = await this.branded.findByBarcode(input.barcode, input.locale);
    if (!found.ok) return found;
    if (found.value === null) return fail(new NotFoundFailure('errors.not_found.food'));
    return ok(FoodProductMapper.toDetailDto(FoodProductMapper.brandedDetail(found.value), input.locale));
  }
}
