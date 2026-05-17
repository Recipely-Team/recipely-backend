import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { ICommentRepository } from '@domain/comments/i-comment-repository';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';

export interface DeleteCommentInput {
  readonly commentId: string;
  readonly requesterId: string;
}

export class DeleteCommentUseCase {
  constructor(
    private readonly commentRepo: ICommentRepository,
    private readonly recipeRepo: IRecipeRepository,
  ) {}

  async execute(input: DeleteCommentInput): Promise<Result<void, Failure>> {
    const commentResult = await this.commentRepo.getById(input.commentId);
    if (!commentResult.ok) return commentResult;
    const comment = commentResult.value;

    const recipeResult = await this.recipeRepo.getById(comment.recipeId);
    if (!recipeResult.ok) return recipeResult;
    const recipe = recipeResult.value.recipe;

    const isAuthor = input.requesterId === comment.authorId;
    const isOwner = input.requesterId === recipe.ownerId;
    if (!isAuthor && !isOwner) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    return this.commentRepo.softDelete(input.commentId);
  }
}
