import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { CreatorPlatform } from '@domain/users/creator-platform';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';

export interface RemoveCreatorTagInput {
  readonly userId: string;
  readonly platform: CreatorPlatform;
}

/**
 * **`DELETE /me/creator/:platform`** — withdraws the claim on one platform,
 * whatever its status; the other platform's tag is left alone. Withdrawing a
 * claim that does not exist succeeds.
 */
export class RemoveCreatorTagUseCase {
  constructor(private readonly creatorTags: CreatorTagRepositoryInterface) {}

  execute(input: RemoveCreatorTagInput): Promise<Result<void, Failure>> {
    return this.creatorTags.remove(input.userId, input.platform);
  }
}
