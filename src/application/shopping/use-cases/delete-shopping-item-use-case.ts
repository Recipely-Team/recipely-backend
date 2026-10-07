import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ShoppingListRepositoryInterface } from '@domain/shopping/shopping-list-repository-interface';

export interface DeleteShoppingItemInput {
  readonly id: string;
  readonly userId: string;
}

/** Removes one line; someone else's item is `not_found`. */
export class DeleteShoppingItemUseCase {
  constructor(private readonly repo: ShoppingListRepositoryInterface) {}

  execute(input: DeleteShoppingItemInput): Promise<Result<void, Failure>> {
    return this.repo.delete(input.id, input.userId);
  }
}
