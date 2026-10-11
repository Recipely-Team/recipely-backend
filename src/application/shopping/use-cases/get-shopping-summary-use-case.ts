import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ShoppingListRepositoryInterface } from '@domain/shopping/shopping-list-repository-interface';
import type { ShoppingSummaryDto } from '@application/shopping/dtos/shopping-summary.dto';

/**
 * What the app's cart badge shows: how many items are still to buy.
 *
 * @remarks
 * - **A count, not a page**: the list is paged, so the client cannot count
 *   unchecked items from what it has loaded.
 */
export class GetShoppingSummaryUseCase {
  constructor(private readonly repo: ShoppingListRepositoryInterface) {}

  async execute(userId: string): Promise<Result<ShoppingSummaryDto, Failure>> {
    return mapResult(await this.repo.countUnchecked(userId), (unchecked) => ({ unchecked }));
  }
}
