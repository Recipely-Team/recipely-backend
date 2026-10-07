import { Router } from 'express';
import type { FlagsController } from '@presentation/controllers/flags.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

// Public: a flag decides what a guest sees too, so no auth middleware.
export function flagsRoutes(controller: FlagsController): Router {
  const router = Router();
  router.get('/', asyncHandler(controller.list));
  return router;
}
