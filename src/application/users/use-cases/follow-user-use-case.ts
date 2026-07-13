import { ok, fail, type Result } from '@core/result/result';
import { type Failure, ConflictFailure, NotFoundFailure, ValidationFailure } from '@core/failure';
import type { IUserFollowRepository } from '@domain/users/i-user-follow-repository';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { NotificationService } from '@application/notifications/notification-service';

export interface FollowUserInput {
  readonly followerId: string;
  readonly followingId: string;
}

export class FollowUserUseCase {
  constructor(
    private readonly followRepo: IUserFollowRepository,
    private readonly authRepo: IAuthRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async execute(input: FollowUserInput): Promise<Result<void, Failure>> {
    if (input.followerId === input.followingId) {
      return fail(new ValidationFailure('errors.validation.cannot_follow_self', 'followingId'));
    }
    // A deleted account still satisfies the follow FK, so the write would succeed
    // and permanently inflate the follower's following count — with no way to undo
    // it, since the target's profile 404s.
    const targetResult = await this.authRepo.isActive(input.followingId);
    if (!targetResult.ok) return targetResult;
    if (!targetResult.value) {
      return fail(new NotFoundFailure('errors.not_found.user'));
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
