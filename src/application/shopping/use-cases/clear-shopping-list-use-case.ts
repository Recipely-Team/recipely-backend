import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ShoppingListRepositoryInterface } from '@domain/shopping/shopping-list-repository-interface';

export interface ClearShoppingListInput {
  readonly userId: string;
  /** `true` clears only the ticked-off lines ("clear completed"); `false` clears everything. */
  readonly checkedOnly: boolean;
}

export interface ClearShoppingListResult {
  readonly deleted: number;
}

/** Empties the list, or just its completed lines. Clearing an empty list is not an error. */
export class ClearShoppingListUseCase {
  constructor(private readonly repo: ShoppingListRepositoryInterface) {}

  async execute(input: ClearShoppingListInput): Promise<Result<ClearShoppingListResult, Failure>> {
    const removed = input.checkedOnly
      ? await this.repo.deleteChecked(input.userId)
      : await this.repo.deleteAll(input.userId);
    return mapResult(removed, (deleted) => ({ deleted }));
  }
}
