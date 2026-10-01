import { Router, type RequestHandler } from 'express';
import type { MeController } from '@presentation/controllers/me.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function meRoutes(
  controller: MeController,
  authMiddleware: RequestHandler,
  deviceRateLimit: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/', asyncHandler(controller.getMyProfile));
  router.patch('/profile', asyncHandler(controller.updateMyProfile));
  router.put('/creator', asyncHandler(controller.requestCreatorTag));
  router.delete('/creator/:platform', asyncHandler(controller.removeCreatorTag));
  router.get('/recipes', asyncHandler(controller.myRecipes));
  router.get('/favorites', asyncHandler(controller.myFavorites));
  router.get('/likes', asyncHandler(controller.myLikes));
  router.get('/devices', asyncHandler(controller.myDevices));
  router.post('/devices', deviceRateLimit, asyncHandler(controller.recordMyDevice));
  router.delete('/', asyncHandler(controller.deleteAccount));
  return router;
}
