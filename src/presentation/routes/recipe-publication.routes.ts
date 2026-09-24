import { Router, type RequestHandler } from 'express';
import type { RecipePublicationController } from '@presentation/controllers/recipe-publication.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/**
 * `POST /recipes/:id/publish` and `/unpublish` — the owner's step from a
 * private recipe to a public one, and back. Mounted before `recipesRoutes`
 * like the other `/recipes/*` routers, so its generic `/:id` never sees these.
 */
export function recipePublicationRoutes(
  controller: RecipePublicationController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();
  router.post('/:id/publish', authMiddleware, asyncHandler(controller.publish));
  router.post('/:id/unpublish', authMiddleware, asyncHandler(controller.unpublish));
  return router;
}
