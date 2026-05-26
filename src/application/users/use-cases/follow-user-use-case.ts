import { ok, fail, type Result } from '@core/result/result';
import { type Failure, ConflictFailure, ValidationFailure } from '@core/failure';
import type { IUserFollowRepository } from '@domain/users/i-user-follow-repository';
import type { NotificationService } from '@application/notifications/notification-service';

export interface FollowUserInput {
  readonly followerId: string;
  readonly followingId: string;
}

export class FollowUserUseCase {
  constructor(
    private readonly followRepo: IUserFollowRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async execute(input: FollowUserInput): Promise<Result<void, Failure>> {
    if (input.followerId === input.followingId) {
      return fail(new ValidationFailure('errors.validation.cannot_follow_self', 'followingId'));
    }
    const alreadyResult = await this.followRepo.isFollowing(input.followerId, input.followingId);
    if (!alreadyResult.ok) return alreadyResult;
    if (alreadyResult.value) {
      return fail(new ConflictFailure('errors.conflict.already_following'));
    }
    const result = await this.followRepo.follow(input.followerId, input.followingId);
    if (!result.ok) return result;
    // Fire-and-forget notification
    void this.notificationService.notify({
      recipientId: input.followingId,
      type: 'follow',
      senderId: input.followerId,
      title: 'New follower',
      body: 'Someone started following you',
    });
    return ok(undefined);
  }
}
