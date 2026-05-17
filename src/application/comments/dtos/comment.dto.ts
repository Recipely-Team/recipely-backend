export interface CommentDto {
  readonly id: string;
  readonly body: string;
  readonly moderationStatus: string;
  readonly recipeId: string;
  readonly authorId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PagedCommentsDto {
  readonly items: CommentDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
