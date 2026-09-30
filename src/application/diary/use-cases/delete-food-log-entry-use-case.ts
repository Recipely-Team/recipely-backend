import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';

export interface DeleteFoodLogEntryInput {
  readonly id: string;
  readonly userId: string;
}

/** Removes one of the user's entries; someone else's entry is `not_found`. */
export class DeleteFoodLogEntryUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  execute(input: DeleteFoodLogEntryInput): Promise<Result<void, Failure>> {
    return this.repo.deleteEntry(input.id, input.userId);
  }
}
