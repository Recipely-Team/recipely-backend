import { Router, type RequestHandler } from 'express';
import type { FeedbackController } from '@presentation/controllers/feedback.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function feedbackRoutes(
  controller: FeedbackController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.post('/', authMiddleware, asyncHandler(controller.submit));

  return router;
}
