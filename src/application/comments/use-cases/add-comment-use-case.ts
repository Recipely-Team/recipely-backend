import { ok, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { Comment } from '@domain/comments/comment';
import type { ICommentRepository } from '@domain/comments/i-comment-repository';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { ICommentModerator } from '@application/comments/ports/i-comment-moderator';
import { CommentMapper } from '@application/comments/mappers/comment.mapper';
import type { CommentDto } from '@application/comments/dtos/comment.dto';
import type { ILogger } from '@application/ports/i-logger';
import { randomUUID } from 'crypto';

export interface AddCommentInput {
  readonly recipeId: string;
  readonly authorId: string;
  readonly body: string;
  readonly locale?: string;
}

export class AddCommentUseCase {
  constructor(
    private readonly commentRepo: ICommentRepository,
    private readonly recipeRepo: IRecipeRepository,
    private readonly moderator: ICommentModerator,
    private readonly logger: ILogger,
  ) {}

  async execute(input: AddCommentInput): Promise<Result<CommentDto, Failure>> {
    const recipeResult = await this.recipeRepo.getById(input.recipeId);
    if (!recipeResult.ok) return recipeResult;

    let moderationStatus: 'approved' | 'pending' | 'rejected' = 'pending';
    const verdictResult = await this.moderator.moderate({ body: input.body });
    if (!verdictResult.ok) {
      this.logger.warn(
        { code: verdictResult.failure.code, messageKey: verdictResult.failure.messageKey },
        'add_comment_moderation_upstream_error — comment saved as pending',
      );
      moderationStatus = 'pending';
    } else if (verdictResult.value.status === 'approved') {
      moderationStatus = 'approved';
    } else {
      return { ok: false, failure: new UnprocessableFailure('errors.comment.rejected') };
    }

    const now = new Date();
    const commentResult = Comment.create({
      id: randomUUID(),
      body: input.body,
      recipeId: input.recipeId,
      authorId: input.authorId,
      moderationStatus,
      createdAt: now,
      updatedAt: now,
    });
    if (!commentResult.ok) return commentResult;

    const persisted = await this.commentRepo.create(commentResult.value);
    if (!persisted.ok) return persisted;

    return ok(CommentMapper.toDto(persisted.value));
  }
}
