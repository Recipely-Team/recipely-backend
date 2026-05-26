import { fail, type Result } from '@core/result/result';
import { type Failure, NotFoundFailure } from '@core/failure';
import type { IUserFollowRepository } from '@domain/users/i-user-follow-repository';

export interface UnfollowUserInput {
  readonly followerId: string;
  readonly followingId: string;
}

export class UnfollowUserUseCase {
  constructor(private readonly followRepo: IUserFollowRepository) {}

  async execute(input: UnfollowUserInput): Promise<Result<void, Failure>> {
    const alreadyResult = await this.followRepo.isFollowing(input.followerId, input.followingId);
    if (!alreadyResult.ok) return alreadyResult;
    if (!alreadyResult.value) {
      return fail(new NotFoundFailure('errors.not_found.follow'));
    }
    return this.followRepo.unfollow(input.followerId, input.followingId);
  }
}
