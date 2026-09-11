import type { CommentDto } from '@application/comments/dtos/comment.dto';
import type { PageResult } from '@domain/common/page-result';

export type PagedCommentsDto = PageResult<CommentDto>;
