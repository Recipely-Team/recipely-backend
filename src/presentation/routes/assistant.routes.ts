import { Router, type RequestHandler } from 'express';
import type { AssistantController } from '@presentation/controllers/assistant.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function assistantRoutes(
  controller: AssistantController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.post('/session', asyncHandler(controller.session));
  router.post('/heartbeat', asyncHandler(controller.heartbeat));
  return router;
}
