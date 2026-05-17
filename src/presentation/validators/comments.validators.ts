import { z } from 'zod';

export const AddCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const CommentIdParamSchema = z.object({
  commentId: z.string().uuid(),
});

export const ListCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
