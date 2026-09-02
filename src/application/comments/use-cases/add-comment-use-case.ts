import { ModerationStatus } from '@domain/moderation/moderation-status';
import { ok, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { Comment } from '@domain/comments/comment';
import type { CommentRepositoryInterface } from '@domain/comments/comment-repository-interface';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { CommentModeratorInterface } from '@application/comments/ports/comment-moderator-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import { CommentMapper } from '@application/comments/mappers/comment.mapper';
import type { CommentDto } from '@application/comments/dtos/comment.dto';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { NotificationService } from '@application/notifications/notification-service';
import { randomUUID } from 'crypto';

export interface AddCommentInput {
  readonly recipeId: string;
  readonly authorId: string;
  readonly body: string;
  readonly rating?: number;
  readonly locale?: string;
}

export class AddCommentUseCase {
  constructor(
    private readonly commentRepo: CommentRepositoryInterface,
    private readonly recipeRepo: RecipeRepositoryInterface,
    private readonly moderator: CommentModeratorInterface,
    private readonly logger: LoggerInterface,
    private readonly notificationService: NotificationService | null = null,
    private readonly authRepo: AuthRepositoryInterface | null = null,
    private readonly contentModerator: ContentModeratorInterface,
  ) {}

  async execute(input: AddCommentInput): Promise<Result<CommentDto, Failure>> {
    const contentVerdict = this.contentModerator.moderate({ text: input.body, context: 'general' });
    if (contentVerdict.status === ModerationStatus.Rejected) {
      return { ok: false, failure: contentBlockedFailure(contentVerdict.hit) };
    }

    // Pass authorId so the owner can still comment on their own unpublished
    // recipe — getById hides unpublished rows from everyone else.
    const recipeResult = await this.recipeRepo.getById(input.recipeId, input.authorId);
    if (!recipeResult.ok) return recipeResult;
    const recipe = recipeResult.value.recipe;

    let moderationStatus: ModerationStatus = ModerationStatus.Pending;
    const verdictResult = await this.moderator.moderate({ body: input.body });
    if (!verdictResult.ok) {
      this.logger.warn(
        { code: verdictResult.failure.code, messageKey: verdictResult.failure.messageKey },
        'add_comment_moderation_upstream_error — comment saved as pending',
      );
      moderationStatus = ModerationStatus.Pending;
    } else if (verdictResult.value.status === ModerationStatus.Approved) {
      moderationStatus = ModerationStatus.Approved;
    } else {
      return { ok: false, failure: new UnprocessableFailure('errors.comment.rejected') };
    }

    const now = new Date();
    const commentResult = Comment.create({
      id: randomUUID(),
      body: input.body,
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      recipeId: input.recipeId,
      authorId: input.authorId,
      moderationStatus,
      createdAt: now,
      updatedAt: now,
    });
    if (!commentResult.ok) return commentResult;

    const persisted = await this.commentRepo.create(commentResult.value);
    if (!persisted.ok) return persisted;

    // The JWT only carries { id, email }, so the author's display info must be
    // looked up — without it the freshly-created comment renders with an empty
    // name and no avatar in the app until the list is re-fetched. Best-effort:
    // a lookup failure must never fail a comment that is already persisted.
    let authorDisplayName = '';
    let authorPhotoUrl: string | null = null;
    if (this.authRepo !== null) {
      const authorResult = await this.authRepo.findById(input.authorId);
      if (authorResult.ok && authorResult.value !== null) {
        authorDisplayName = authorResult.value.displayName;
        authorPhotoUrl = authorResult.value.photoUrl;
      }
    }

    // Notify the recipe owner if different from the commenter — fire-and-forget.
    if (this.notificationService !== null && recipe.ownerId !== input.authorId && moderationStatus === ModerationStatus.Approved) {
      this.notificationService.notify({
        recipientId: recipe.ownerId,
        type: 'comment',
        senderId: input.authorId,
        recipeId: input.recipeId,
        commentId: persisted.value.id,
        title: 'New comment',
        body: `${authorDisplayName.length > 0 ? authorDisplayName : 'Someone'} commented on your recipe.`,
        // Surface the actual comment text in the in-app notification feed.
        message: input.body,
      }).catch(() => {});
    }

    return ok(CommentMapper.toDto(persisted.value, authorDisplayName, authorPhotoUrl));
  }
}
