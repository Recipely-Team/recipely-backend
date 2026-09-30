import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';

/** **`DELETE /me/creator`** — withdraws the claim, whatever its status. */
export class RemoveCreatorTagUseCase {
  constructor(private readonly creatorTags: CreatorTagRepositoryInterface) {}

  execute(userId: string): Promise<Result<void, Failure>> {
    return this.creatorTags.save(userId, null);
  }
}
