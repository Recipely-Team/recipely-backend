import { Router, type RequestHandler } from 'express';
import type { CommentsController } from '@presentation/controllers/comments.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function commentsRoutes(controller: CommentsController, authMiddleware: RequestHandler): Router {
  const router = Router();

  router.get('/:id/comments', authMiddleware, asyncHandler(controller.list));
  router.post('/:id/comments', authMiddleware, asyncHandler(controller.add));
  router.delete('/:id/comments/:commentId', authMiddleware, asyncHandler(controller.remove));

  return router;
}
