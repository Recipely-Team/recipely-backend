import type { PageResult } from '@domain/common/page-result';

export interface CommentDto {
  readonly id: string;
  readonly body: string;
  readonly rating: number | null;
  readonly moderationStatus: string;
  readonly recipeId: string;
  readonly authorId: string;
  readonly authorDisplayName: string;
  readonly authorPhotoUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PagedCommentsDto = PageResult<CommentDto>;
