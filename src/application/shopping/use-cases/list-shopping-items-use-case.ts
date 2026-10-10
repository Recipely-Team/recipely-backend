import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { ShoppingListRepositoryInterface } from '@domain/shopping/shopping-list-repository-interface';
import { ShoppingItemMapper } from '@application/shopping/mappers/shopping-item.mapper';
import type { ShoppingItemDto } from '@application/shopping/dtos/shopping-item.dto';

export interface ListShoppingItemsInput {
  readonly userId: string;
  readonly page: number;
  readonly pageSize: number;
}

/** One page of the user's list: unchecked first, then checked, each in insertion order. */
export class ListShoppingItemsUseCase {
  constructor(private readonly repo: ShoppingListRepositoryInterface) {}

  async execute(input: ListShoppingItemsInput): Promise<Result<PageResult<ShoppingItemDto>, Failure>> {
    return mapResult(await this.repo.list(input.userId, input.page, input.pageSize), (page) => ({
      ...page,
      items: page.items.map(ShoppingItemMapper.toDto),
    }));
  }
}
