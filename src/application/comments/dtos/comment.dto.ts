import type { PageResult } from '@domain/common/page-result';

export interface CommentDto {
  readonly id: string;
  readonly body: string;
  readonly moderationStatus: string;
  readonly recipeId: string;
  readonly authorId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PagedCommentsDto = PageResult<CommentDto>;
