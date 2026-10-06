import { Router } from 'express';
import type { HealthController } from '@presentation/controllers/health.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function healthRoutes(controller: HealthController): Router {
  const router = Router();
  router.get('/', controller.liveness);
  router.get('/ready', asyncHandler(controller.readiness));
  return router;
}
