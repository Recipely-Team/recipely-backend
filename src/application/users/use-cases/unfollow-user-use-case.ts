import { fail, type Result } from '@core/result/result';
import { type Failure, NotFoundFailure } from '@core/failure';
import type { UserFollowRepositoryInterface } from '@domain/users/user-follow-repository-interface';

export interface UnfollowUserInput {
  readonly followerId: string;
  readonly followingId: string;
}

export class UnfollowUserUseCase {
  constructor(private readonly followRepo: UserFollowRepositoryInterface) {}

  async execute(input: UnfollowUserInput): Promise<Result<void, Failure>> {
    const alreadyResult = await this.followRepo.isFollowing(input.followerId, input.followingId);
    if (!alreadyResult.ok) return alreadyResult;
    if (!alreadyResult.value) {
      return fail(new NotFoundFailure('errors.not_found.follow'));
    }
    return this.followRepo.unfollow(input.followerId, input.followingId);
  }
}
