import { Router, type RequestHandler } from 'express';
import type { MeController } from '@presentation/controllers/me.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function meRoutes(controller: MeController, authMiddleware: RequestHandler): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/recipes', asyncHandler(controller.myRecipes));
  router.get('/favorites', asyncHandler(controller.myFavorites));
  return router;
}
