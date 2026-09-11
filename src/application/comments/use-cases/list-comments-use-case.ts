import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { CommentRepositoryInterface } from '@domain/comments/comment-repository-interface';
import { CommentMapper } from '@application/comments/mappers/comment.mapper';
import type { PagedCommentsDto } from '@application/comments/dtos/paged-comments.dto';

export interface ListCommentsInput {
  readonly recipeId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly currentUserId?: string;
}

export class ListCommentsUseCase {
  constructor(private readonly commentRepo: CommentRepositoryInterface) {}

  async execute(input: ListCommentsInput): Promise<Result<PagedCommentsDto, Failure>> {
    const result = await this.commentRepo.listByRecipe(
      input.recipeId,
      input.page,
      input.pageSize,
      input.currentUserId,
    );
    if (!result.ok) return result;

    const { items, total, page, pageSize } = result.value;
    return ok({
      items: items.map(CommentMapper.withAuthorToDto),
      total,
      page,
      pageSize,
    });
  }
}
