import { Router, type RequestHandler } from 'express';
import type { CommentsController } from '@presentation/controllers/comments.controller';
import type { CommentLikesController } from '@presentation/controllers/comment-likes.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function commentsRoutes(
  controller: CommentsController,
  commentLikesController: CommentLikesController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.get('/:id/comments', authMiddleware, asyncHandler(controller.list));
  router.post('/:id/comments', authMiddleware, asyncHandler(controller.add));
  router.delete('/:id/comments/:commentId', authMiddleware, asyncHandler(controller.remove));

  router.post('/:id/comments/:commentId/like', authMiddleware, asyncHandler(commentLikesController.like));
  router.delete('/:id/comments/:commentId/like', authMiddleware, asyncHandler(commentLikesController.unlike));

  return router;
}
