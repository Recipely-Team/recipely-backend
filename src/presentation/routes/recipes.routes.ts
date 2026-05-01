import { Router, type RequestHandler } from 'express';
import type { RecipesController } from '@presentation/controllers/recipes.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function recipesRoutes(
  controller: RecipesController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();
  router.get('/', asyncHandler(controller.list));
  router.get('/:id', asyncHandler(controller.getById));
  router.post('/', authMiddleware, asyncHandler(controller.create));
  return router;
}
