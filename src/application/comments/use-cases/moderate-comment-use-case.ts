import { ModerationStatus } from '@domain/moderation/moderation-status';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { CommentRepositoryInterface } from '@domain/comments/comment-repository-interface';
import type { NotificationService } from '@application/notifications/notification-service';

export type CommentModerationDecision = typeof ModerationStatus.Approved | typeof ModerationStatus.Rejected;

export interface ModerateCommentInput {
  readonly commentId: string;
  readonly decision: CommentModerationDecision;
}

/**
 * Backs the admin panel's approve/reject buttons on Comment. The repository
 * handles the Recipe.commentCount adjustment transactionally — this use case
 * only decides whether to notify the author of the outcome.
 */
export class ModerateCommentUseCase {
  constructor(
    private readonly commentRepo: CommentRepositoryInterface,
    private readonly notificationService: NotificationService | null = null,
  ) {}

  async execute(input: ModerateCommentInput): Promise<Result<void, Failure>> {
    const result = await this.commentRepo.setModerationStatus(input.commentId, input.decision);
    if (!result.ok) return result;

    if (this.notificationService !== null) {
      this.notificationService.notify({
        recipientId: result.value.authorId,
        type: 'moderation',
        recipeId: result.value.recipeId,
        commentId: input.commentId,
        title: input.decision === ModerationStatus.Approved ? 'Comment approved' : 'Comment rejected',
        body:
          input.decision === ModerationStatus.Approved
            ? 'Your comment was approved and is now visible.'
            : 'Your comment was rejected by moderation.',
      });
    }

    return ok(undefined);
  }
}
