import { Router, type RequestHandler } from 'express';
import type { InstagramController } from '@presentation/controllers/instagram/instagram.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/** `/me/instagram` inside the API envelope: the creator's link, media and rules. Every route needs a session. */
export function instagramMeRoutes(controller: InstagramController, authMiddleware: RequestHandler): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/', asyncHandler(controller.getConnection));
  router.delete('/', asyncHandler(controller.disconnect));
  router.post('/finalize', asyncHandler(controller.finalize));
  router.get('/media', asyncHandler(controller.listMedia));
  router.get('/rules', asyncHandler(controller.listRules));
  router.post('/rules', asyncHandler(controller.createRule));
  router.get('/rules/:id', asyncHandler(controller.getRule));
  router.patch('/rules/:id', asyncHandler(controller.updateRule));
  router.delete('/rules/:id', asyncHandler(controller.deleteRule));
  router.get('/rules/:id/sends', asyncHandler(controller.listSends));
  return router;
}

/** `/auth/instagram/start` inside the API envelope: the consent URL for the signed-in user. */
export function instagramStartRoutes(controller: InstagramController, authMiddleware: RequestHandler): Router {
  const router = Router();
  router.get('/start', authMiddleware, asyncHandler(controller.start));
  return router;
}
