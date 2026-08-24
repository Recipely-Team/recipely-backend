import { Router, type RequestHandler } from 'express';
import type { AssistantController } from '@presentation/controllers/assistant.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function assistantRoutes(
  controller: AssistantController,
  authMiddleware: RequestHandler,
  aiRateLimit: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.post('/session', asyncHandler(controller.session));
  router.post('/heartbeat', asyncHandler(controller.heartbeat));
  // The typed turn is not charged against the voice budget — it is what the
  // app falls back to when that budget is gone — so the rate limit is what
  // bounds it instead.
  router.post('/message', aiRateLimit, asyncHandler(controller.message));
  return router;
}
