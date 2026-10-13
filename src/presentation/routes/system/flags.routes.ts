import { Router } from 'express';
import { publicReadCache } from '@presentation/middlewares/public-read-cache';

import type { FlagsController } from '@presentation/controllers/flags.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/** An admin flip reaches every client within this many seconds. */
const FLAGS_CACHE_SECONDS = 60;

// Public: a flag decides what a guest sees too, so no auth middleware.
export function flagsRoutes(controller: FlagsController): Router {
  const router = Router();
  router.get('/', publicReadCache(FLAGS_CACHE_SECONDS), asyncHandler(controller.list));
  return router;
}
